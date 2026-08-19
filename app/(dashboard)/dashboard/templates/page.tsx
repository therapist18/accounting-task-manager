// @ts-nocheck
"use client"

import React, { useState, useMemo, useEffect, useRef, useCallback } from "react"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup
} from "@/components/ui/resizable"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { PlusCircle, FileText, Loader2, Settings, Trash2, Check } from "lucide-react"
import { toast } from "@/components/ui/use-toast"
import { supabase } from "@/lib/supabase/client"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { ENTITY_TYPES, type EntityType } from "@/lib/constants/entity-types"

import Link from "next/link"
import { DepartmentSidebar } from "../departments/main-shared-components/department-sidebar"
import { fetchDepartments } from "../departments/departments/database"
import { DocumentTemplateManager } from "./document-template-manager/page"

// --- Main Page Component ---
export default function LettersPage() {
  const [departments, setDepartments] = useState<any[]>([]);
  const [selectedDepartment, setSelectedDepartment] = useState<string>('');
  const [selectedSubdepartment, setSelectedSubdepartment] = useState<string>('');
  const [selectedClass, setSelectedClass] = useState<string>('');
  const [selectedSubclass, setSelectedSubclass] = useState<string>('');
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});
  const [letterTypes, setLetterTypes] = useState<any[]>([]);
  const [selectedLetter, setSelectedLetter] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<any | null>(null);
  const [templateVersion, setTemplateVersion] = useState(0);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const sidebarPanelRef = useRef(null);

  const handleSidebarToggle = useCallback(() => {
    const panel = sidebarPanelRef.current;
    if (panel) {
      if (isSidebarCollapsed) {
        panel.expand();
      } else {
        panel.collapse();
      }
    }
  }, [isSidebarCollapsed]);

  useEffect(() => {
    const performInitialLoad = async () => {
      setIsLoading(true);
      const departmentsData = await fetchDepartments();
      setDepartments(departmentsData);
      setIsLoading(false);
    };
    performInitialLoad();
  }, []);

 // Inside LettersPage component
const jobLevelObject = useMemo(() => {
  const parseId = (id: string) => {
    if (!id) return null;
    const num = Number(id);
    return isNaN(num) ? id : num;
  };
  
  const deptId = parseId(selectedDepartment);
  const subDeptId = parseId(selectedSubdepartment);
  const classId = parseId(selectedClass);
  const subclassId = parseId(selectedSubclass);

  // Find the actual objects in the departments tree to check for children
  const d = departments.find(item => String(item.id) === selectedDepartment);
  const sd = d?.tm_subdepartments?.find(item => String(item.id) === selectedSubdepartment);
  const c = sd?.classes?.find(item => String(item.id) === selectedClass);

  // 1. Level 4: Subclass is selected (Always a leaf)
  if (subclassId) {
    return { level: 4, department_id: deptId, subdepartment_id: subDeptId, class_id: classId, subclass_id: subclassId };
  }

  // 2. Level 3: Class is selected. 
  // If it has no subclasses, or we just want to treat Class as the terminal level for templates.
  if (classId) {
    return { level: 3, department_id: deptId, subdepartment_id: subDeptId, class_id: classId, subclass_id: null };
  }

  // 3. Level 2: Subdepartment is selected.
  // NEW: Check if this subdepartment has NO classes. If so, it's a leaf node.
  if (subDeptId) {
    const hasClasses = sd?.classes && sd.classes.length > 0;
    if (!hasClasses) {
      return { level: 2, department_id: deptId, subdepartment_id: subDeptId, class_id: null, subclass_id: null };
    }
  }

  // 4. Level 1: Department is selected.
  // NEW: Check if this department has NO subdepartments. If so, it's a leaf node.
  if (deptId) {
    const hasSubDepts = d?.tm_subdepartments && d.tm_subdepartments.length > 0;
    if (!hasSubDepts) {
      return { level: 1, department_id: deptId, subdepartment_id: null, class_id: null, subclass_id: null };
    }
  }

  return null;
}, [departments, selectedDepartment, selectedSubdepartment, selectedClass, selectedSubclass]);
 
useEffect(() => {
  const fetchLetterTypesForClass = async () => {
    // Stop if no valid terminal level (leaf) is selected
    if (!jobLevelObject) {
      setLetterTypes([]);
      setSelectedLetter(null);
      return;
    }

    setIsLoading(true);
    try {
      const { data: requirementsData, error: requirementsError } = await supabase
        .from('tm_class_requirements')
        .select('requirements')
        .eq('job_level', JSON.stringify(jobLevelObject))
        .maybeSingle();

      if (requirementsError) throw requirementsError; 

        if (!requirementsData?.requirements || !Array.isArray(requirementsData.requirements)) {
          setLetterTypes([]);
          return;
        }

        // 3. Filter requirements where hasTemplate is true and extract KYC IDs
        const templateRequirements = requirementsData.requirements.filter(
          (req: any) => req.hasTemplate === true && req.document_ids && req.document_ids.length > 0
        );

        if (templateRequirements.length === 0) {
          setLetterTypes([]);
          return;
        }

        // Extract all unique KYC Document IDs from the filtered requirements
        const kycDocumentIds = [
          ...new Set(templateRequirements.flatMap((req: any) => req.document_ids))
        ];

        // 4. Fetch the actual KYC document definitions
        let { data: documentsData, error: documentsError } = await supabase
          .from('acc_portal_kyc')
          .select('*')
          .in('id', kycDocumentIds);

        if (documentsError) throw documentsError;

        setLetterTypes(documentsData || []);
      } catch (error) {
        console.error("Error fetching letter types:", error);
        setLetterTypes([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchLetterTypesForClass();
  }, [jobLevelObject]);

  const handleLetterClick = (letter: any) => {
    setSelectedLetter(letter);
  };

  const handleDeptClick = (deptId: string) => { setSelectedDepartment(deptId); setSelectedSubdepartment(''); setSelectedClass(''); setSelectedSubclass(''); };
  const handleSubdeptClick = (deptId: string, subdeptId: string) => { setSelectedDepartment(deptId); setSelectedSubdepartment(subdeptId); setSelectedClass(''); setSelectedSubclass(''); };
  const handleClassClick = (deptId: string, subdeptId: string, classId: string) => { setSelectedDepartment(deptId); setSelectedSubdepartment(subdeptId); setSelectedClass(classId); setSelectedSubclass(''); };
  const handleSubclassClick = (deptId: string, subdeptId: string, classId: string, subclassId: string) => { setSelectedDepartment(deptId); setSelectedSubdepartment(subdeptId); setSelectedClass(classId); setSelectedSubclass(subclassId); };

  const handleTemplateUpdate = () => setTemplateVersion(v => v + 1);
  const handleCreateNewTemplate = () => { setEditingTemplate(null); setTemplateDialogOpen(true); };
  const handleEditTemplate = (template: any) => { setEditingTemplate(template); setTemplateDialogOpen(true); };
  const closeTemplateDialog = () => { setTemplateDialogOpen(false); setEditingTemplate(null); };

  const createRequirementUrl = useMemo(() => {
    if (!jobLevelObject) return "/dashboard/departments?tab=requirements";
    const params = new URLSearchParams({ tab: "requirements" });
    if (jobLevelObject.department_id) params.set("deptId", String(jobLevelObject.department_id));
    if (jobLevelObject.subdepartment_id) params.set("subdeptId", String(jobLevelObject.subdepartment_id));
    if (jobLevelObject.class_id) params.set("classId", String(jobLevelObject.class_id));
    if (jobLevelObject.subclass_id) params.set("subclassId", String(jobLevelObject.subclass_id));
    return `/dashboard/departments?${params.toString()}`;
  }, [jobLevelObject]);

  const breadcrumb = useMemo(() => {
    const d = departments.find(d => String(d.id) === selectedDepartment);
    const sd = d?.tm_subdepartments?.find(s => String(s.id) === selectedSubdepartment);
    const c = sd?.classes?.find(c => String(c.id) === selectedClass);
    const sc = c?.subClasses?.find(sc => String(sc.id) === selectedSubclass);
    return [d, sd, c, sc].filter(Boolean).map(item => item.name).join(' > ');
  }, [departments, selectedDepartment, selectedSubdepartment, selectedClass, selectedSubclass]);

  return (
    <div className="h-[calc(100vh-theme(spacing.16))] w-full overflow-hidden bg-background">
      <ResizablePanelGroup direction="horizontal">
        {/* SIDEBAR PANEL */}
        <ResizablePanel
          ref={sidebarPanelRef}
          defaultSize={20}
          minSize={15}
          maxSize={25}
          collapsible={true}
          onCollapse={() => setIsSidebarCollapsed(true)}
          onExpand={() => setIsSidebarCollapsed(false)}
          className={cn(
            "transition-all duration-300 ease-in-out",
            isSidebarCollapsed ? "min-w-[50px]" : ""
          )}
        >
          <DepartmentSidebar
            departments={departments}
            activeDept={selectedDepartment}
            activeSubdept={selectedSubdepartment}
            activeClass={selectedClass}
            activeSubclass={selectedSubclass}
            onDeptClick={handleDeptClick}
            onSubdeptClick={handleSubdeptClick}
            onClassClick={handleClassClick}
            onSubclassClick={handleSubclassClick}
            expandedItems={expandedItems}
            onToggleExpand={(key) => setExpandedItems(prev => ({ ...prev, [key]: !prev[key] }))}
            // NEW PROPS FOR COLLAPSE
            isCollapsed={isSidebarCollapsed}
            onCollapseToggle={handleSidebarToggle}
          />
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* MAIN CONTENT PANEL */}
        <ResizablePanel defaultSize={80}>
          <main className="h-full overflow-hidden p-6 space-y-6 flex flex-col">
            <header className="border-b border-slate-100 pb-4 shrink-0 flex items-center justify-between gap-4">
              <div className="space-y-1">
                <h1 className="text-2xl font-bold tracking-tight text-slate-800">Template Management</h1>
                <p className="text-xs text-slate-500 font-medium flex items-center gap-1">
                  {breadcrumb ? (
                    <>
                      <span className="text-slate-400 font-normal">Path:</span>
                      <span className="text-blue-600 font-semibold">{breadcrumb}</span>
                    </>
                  ) : (
                    "Select a department from the sidebar to configure templates"
                  )}
                </p>
              </div>
            </header>
          {isLoading && !jobLevelObject ? (
  <div className="flex justify-center items-center h-2/3">
    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
  </div>
) : !jobLevelObject ? ( 
  /* CHANGE 2: Show this card ONLY if no valid leaf node is selected */
  <Card className="mt-8">
    <CardHeader className="flex flex-row items-center justify-between">
      <div>
        <CardTitle>Select an Item</CardTitle>
        <CardDescription>Choose a department, subdepartment, or class from the sidebar.</CardDescription>
      </div>
    </CardHeader>
    <CardContent className="text-center py-12">
      <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
    </CardContent>
  </Card>
) : (
              <div className="grid grid-cols-12 gap-6 h-[calc(100%-80px)]">
                <Card className="col-span-4 h-full flex flex-col rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b border-slate-50 pb-4">
                    <div>
                      <CardTitle className="text-base font-bold text-slate-800">Template Types</CardTitle>
                      <CardDescription className="text-xs text-slate-400">Required templates.</CardDescription>
                    </div>
                  </CardHeader>

                  <CardContent className="flex-1 overflow-hidden p-3 bg-slate-50/10">
                    <ScrollArea className="h-full">
                      {isLoading ? (
                        <div className="flex justify-center items-center h-full"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
                      ) : letterTypes.length > 0 ? (
                        <div className="space-y-1">
                          {letterTypes.filter(letter => letter.has_template === "true").map(letter => {
                            const isDocActive = selectedLetter?.id === letter.id;

                            return (
                              <div key={letter.id}>
                                <button
                                  className={cn(
                                    "flex items-center w-full rounded-xl transition-all duration-200 hover:bg-slate-50 group px-4 py-3 text-left text-xs font-bold outline-none border",
                                    isDocActive ? "bg-blue-50 text-blue-700 border-blue-100 shadow-sm" : "bg-transparent text-slate-600 border-transparent"
                                  )}
                                  onClick={() => handleLetterClick(letter)}
                                >
                                  {letter.display_name}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-10 text-center space-y-3">
                          <FileText className="h-8 w-8 text-slate-300" />
                          <p className="text-xs text-slate-400 max-w-[200px]">No template types found for this selection.</p>
                          <p className="text-[10px] text-slate-400 max-w-[220px]">
                            Create a requirement with a template in the Upload Requirements section first.
                          </p>
                          <Link href={createRequirementUrl}>
                            <Button size="sm" variant="outline" className="mt-1 text-xs gap-1.5 border-blue-200 text-blue-600 hover:bg-blue-50">
                              <PlusCircle className="h-3.5 w-3.5" />
                              Create Requirement
                            </Button>
                          </Link>
                        </div>
                      )}
                    </ScrollArea>
                  </CardContent>
                </Card>

                <div className="col-span-8 h-full">
                  {selectedLetter ? (
                    <TemplateDisplayArea
                      key={`${selectedLetter.id}-${templateVersion}`}
                      selectedLetter={selectedLetter}
                      jobLevel={jobLevelObject}
                      onCreateNew={() => handleCreateNewTemplate()}
                      onEdit={handleEditTemplate}
                      templateVersion={templateVersion}
                    />
                  ) : (
                    <Card className="h-full flex items-center justify-center text-muted-foreground">
                      <div className="text-center">
                        <FileText className="h-10 w-10 mx-auto mb-2 opacity-20" />
                        <h3 className="text-lg font-medium">Select a Document</h3>
                        <p className="text-sm">Choose an item from the sidebar to view templates.</p>
                      </div>
                    </Card>
                  )}
                </div>
              </div>
            )}
          </main>
        </ResizablePanel>
      </ResizablePanelGroup>
      {selectedLetter && (
        <DocumentTemplateManager
          document={selectedLetter}
          isOpen={templateDialogOpen}
          onClose={closeTemplateDialog}
          onTemplateUpdate={handleTemplateUpdate}
          jobLevel={jobLevelObject}
          initialTemplates={editingTemplate ? [editingTemplate] : []}
        />
      )}
    </div>
  );
}

function TemplateCard({ template, onEdit, onDelete }) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const handleDelete = async () => {
    try {
      setIsDeleting(true);
      await onDelete(template.id);
      setShowDeleteDialog(false);
    } catch (error) {
      console.error('Error deleting template:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete template',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Card key={template.id} className="border border-slate-100 rounded-2xl shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden">
      <CardHeader className="p-5">
        <CardTitle className="flex justify-between items-center text-sm font-bold text-slate-800">
          {template.file_name}
          <div className="flex gap-1.5">
            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-50" onClick={() => onEdit(template)}>
              <Settings className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-full text-slate-400 hover:text-red-600 hover:bg-red-50"
              onClick={(e) => {
                e.stopPropagation();
                setShowDeleteDialog(true);
              }}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>

          <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
            <AlertDialogContent className="rounded-2xl max-w-sm">
              <AlertDialogHeader>
                <AlertDialogTitle className="text-base font-bold text-slate-800">Are you sure?</AlertDialogTitle>
                <AlertDialogDescription className="text-xs text-slate-500">
                  This will permanently delete the "{template.file_name}" template. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="gap-2 mt-4">
                <AlertDialogCancel className="h-9 px-4 rounded-full text-xs font-semibold">Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  className="h-9 px-4 rounded-full bg-red-600 hover:bg-red-700 text-white text-xs font-semibold shadow-md shadow-red-500/10 border-0"
                  disabled={isDeleting}
                >
                  {isDeleting ? (
                    <>
                      <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                      Deleting...
                    </>
                  ) : "Delete"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardTitle>
        <CardDescription className="flex flex-col gap-3 pt-2">
          <div className="flex flex-wrap gap-1.5">
            {template.entity_types && template.entity_types.length > 0
              ? template.entity_types.map(et => {
                const entityConfig = ENTITY_TYPES.find(entityType => entityType.value === et);
                return (
                  <Badge key={et} variant="outline" className="text-[10px] font-semibold bg-slate-50 text-slate-600 border-slate-200 rounded-full px-2 py-0.5">
                    {entityConfig?.label || et}
                  </Badge>
                );
              })
              : <Badge variant="outline" className="text-[10px] font-semibold bg-slate-50 text-slate-600 border-slate-200 rounded-full px-2 py-0.5">Uncategorized</Badge>
            }
          </div>
          <span className="text-xs text-slate-500 leading-normal">
            {template.description || `Type: ${template.file_type === 'text/html' ? 'Text Editor' : 'DOCX File'}`}
          </span>
        </CardDescription>
      </CardHeader>
    </Card>
  );
}

function TemplateDisplayArea({ selectedLetter, onCreateNew, onEdit, templateVersion, jobLevel }) {
  const [allTemplates, setAllTemplates] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Inside TemplateDisplayArea component in LettersPage.tsx

  useEffect(() => {
    const fetchTemplates = async () => {
      if (!selectedLetter) return;
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from('acc_portal_templates')
          .select('*')
          .eq('document_id', selectedLetter.id)
          .order('file_name', { ascending: true });

        if (error) throw error;
        setAllTemplates(data || []);
      } catch (error) {
        console.error(`Error fetching templates:`, error);
        toast({ title: "Error", description: "Could not fetch templates.", variant: "destructive" });
      } finally {
        setIsLoading(false);
      }
    };
    fetchTemplates();
  }, [selectedLetter, templateVersion]);

  const filteredTemplates = useMemo(() => {
    if (!jobLevel) return allTemplates;

    return allTemplates.filter(t => {
      let tJobs = t.job_level;
      if (typeof tJobs === 'string') {
        try { tJobs = JSON.parse(tJobs); } catch { return false; }
      }
      if (!Array.isArray(tJobs)) {
        tJobs = tJobs ? [tJobs] : [];
      }
      return tJobs.some((job: any) =>
        job.level === jobLevel.level &&
        job.department_id === jobLevel.department_id &&
        job.subdepartment_id === jobLevel.subdepartment_id &&
        job.class_id === jobLevel.class_id &&
        (job.subclass_id === jobLevel.subclass_id || (!job.subclass_id && !jobLevel.subclass_id))
      );
    });
  }, [allTemplates, jobLevel]);

  const categorizedTemplates = useMemo(() => {
    const categorized = { all: filteredTemplates, uncategorized: [] };
    const tabs = new Set<string>();

    filteredTemplates.forEach(template => {
      let entityTypes = template.entity_types;
      if (typeof entityTypes === 'string') {
        try { entityTypes = JSON.parse(entityTypes); } catch { }
      }

      if (Array.isArray(entityTypes) && entityTypes.length > 0) {
        entityTypes.forEach(type => {
          const entityConfig = ENTITY_TYPES.find(entityType => entityType.value === type);
          const label = entityConfig?.label || type;
          tabs.add(label);
          if (!categorized[label]) categorized[label] = [];
          categorized[label].push(template);
        });
      } else {
        categorized.uncategorized.push(template);
      }
    });

    const sortedTabs = Array.from(tabs).sort();
    return { tabs: sortedTabs, categorized };
  }, [filteredTemplates]);

  return (
    <Card className="h-full flex flex-col rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between border-b border-slate-50 pb-4">
        <div>
          <CardTitle className="text-base font-bold text-slate-800">{selectedLetter.display_name}</CardTitle>
          <CardDescription className="text-xs text-slate-400">Templates for this document type.</CardDescription>
        </div>
        <Button 
          onClick={onCreateNew}
          className="h-9 px-4 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-bold shadow-md shadow-blue-500/10 border-0 hover:scale-[1.02] active:scale-[0.98] transition-all"
        >
          <PlusCircle className="mr-1.5 h-4 w-4" /> Create New
        </Button>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden p-5">
        {isLoading ? (
          <div className="flex justify-center items-center h-full"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
        ) : filteredTemplates.length > 0 ? (
          <Tabs defaultValue="all" className="flex flex-col h-full">
            <TabsList className="bg-slate-100/80 p-0.5 rounded-full border border-slate-200/30 self-start">
              <TabsTrigger value="all" className="rounded-full text-xs px-4 h-7 data-[state=active]:bg-white data-[state=active]:text-slate-800 data-[state=active]:shadow-sm">All</TabsTrigger>
              {categorizedTemplates.tabs.map(tab => (
                <TabsTrigger key={tab} value={tab} className="capitalize rounded-full text-xs px-4 h-7 data-[state=active]:bg-white data-[state=active]:text-slate-800 data-[state=active]:shadow-sm">{tab}</TabsTrigger>
              ))}
              {categorizedTemplates.categorized.uncategorized.length > 0 && (
                <TabsTrigger value="uncategorized" className="rounded-full text-xs px-4 h-7 data-[state=active]:bg-white data-[state=active]:text-slate-800 data-[state=active]:shadow-sm">Uncategorized</TabsTrigger>
              )}
            </TabsList>

            <ScrollArea className="h-full mt-4 pr-4">
              <div className="space-y-4">
                <TabsContent value="all">
                  {categorizedTemplates.categorized.all.map(template => (
                    <TemplateCard
                      key={template.id}
                      template={template}
                      onEdit={onEdit}
                      onDelete={async (templateId) => {
                        await supabase.from('acc_portal_templates').delete().eq('id', templateId);
                        setAllTemplates(prev => prev.filter(p => p.id !== templateId)); // Optimistic update
                        toast({ title: 'Success', description: 'Template deleted' });
                      }}
                    />
                  ))}
                </TabsContent>
                {categorizedTemplates.tabs.map(tab => (
                  <TabsContent key={tab} value={tab}>
                    {categorizedTemplates.categorized[tab].map(template => (
                      <TemplateCard
                        key={template.id}
                        template={template}
                        onEdit={onEdit}
                        onDelete={async (templateId) => {
                          await supabase.from('acc_portal_templates').delete().eq('id', templateId);
                          setAllTemplates(prev => prev.filter(p => p.id !== templateId));
                          toast({ title: 'Success', description: 'Template deleted' });
                        }}
                      />
                    ))}
                  </TabsContent>
                ))}
                {/* Uncategorized Tab Content */}
                {categorizedTemplates.categorized.uncategorized.length > 0 && (
                  <TabsContent value="uncategorized">
                    {categorizedTemplates.categorized.uncategorized.map(template => (
                      <TemplateCard
                        key={template.id}
                        template={template}
                        onEdit={onEdit}
                        onDelete={async (templateId) => {
                          await supabase.from('acc_portal_templates').delete().eq('id', templateId);
                          setAllTemplates(prev => prev.filter(p => p.id !== templateId));
                          toast({ title: 'Success', description: 'Template deleted' });
                        }}
                      />
                    ))}
                  </TabsContent>
                )}
              </div>
            </ScrollArea>
          </Tabs>
        ) : (
          <div className="h-full flex items-center justify-center text-center border-2 border-dashed rounded-lg">
            <div>
              <h3 className="text-lg font-medium">No Templates Found</h3>
              <p className="text-sm text-muted-foreground mt-1">
                No templates match the current selection.
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}