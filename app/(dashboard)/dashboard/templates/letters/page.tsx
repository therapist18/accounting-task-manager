// @ts-nocheck
"use client"

import React, { useState, useMemo, useCallback, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { PlusCircle, FileText, Loader2, Settings, ChevronRight } from "lucide-react"
import { toast } from "@/components/ui/use-toast" // Corrected toast import
import { supabase } from "@/lib/supabase/client"
import { ScrollArea } from "@/components/ui/scroll-area"

import { DepartmentSidebar } from "../../departments/main-shared-components/department-sidebar"
import { fetchDepartments } from "../../departments/departments/database"
import DocumentTemplateManager from "./document-template-manager"

// --- Main Page Component ---
export default function LettersPage() {
  // --- State for Sidebar Navigation ---
  const [departments, setDepartments] = useState<any[]>([]);
  const [selectedDepartment, setSelectedDepartment] = useState<string>('');
  const [selectedSubdepartment, setSelectedSubdepartment] = useState<string>('');
  const [selectedClass, setSelectedClass] = useState<string>('');
  const [selectedSubclass, setSelectedSubclass] = useState<string>('');
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});

  // --- State for Page Content ---
  const [letterTypes, setLetterTypes] = useState<any[]>([]);
  const [selectedLetter, setSelectedLetter] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  // --- MODIFICATION: State for Dialog and Editing ---
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<any | null>(null);
  const [templateVersion, setTemplateVersion] = useState(0);

  // --- Initial Data Fetching for Sidebar ---
  useEffect(() => {
    const performInitialLoad = async () => {
      setIsLoading(true);
      const departmentsData = await fetchDepartments();
      setDepartments(departmentsData);
      setIsLoading(false);
    };
    performInitialLoad();
  }, []);

   const constructedClassId = useMemo(() => {
        if (!selectedClass && !selectedSubclass) return null;
        return selectedSubclass ?
            `${selectedSubdepartment}_${selectedClass}_${selectedSubclass}` :
            `${selectedSubdepartment}_${selectedClass}`;
    }, [selectedSubdepartment, selectedClass, selectedSubclass]);
    
    // --- Fetch Letter Types based on Sidebar Selection ---
  useEffect(() => {
    const fetchLetterTypesForClass = async () => {
      const activeClassId = selectedSubclass || selectedClass;
      if (!activeClassId || !selectedSubdepartment) {
        setLetterTypes([]);
        setSelectedLetter(null);
        return;
      }

      setIsLoading(true);
      setSelectedLetter(null); 

      try {
          const { data: requirementsData, error: requirementsError } = await supabase
          .from('tm_class_requirements')
          .select('documents_and_fields')
          .eq('class_id', constructedClassId)
          .single();

        if (requirementsError) {
          if (requirementsError.code === 'PGRST116') {
             setLetterTypes([]);
             return;
          }
          throw requirementsError;
        }
        
        if (!requirementsData?.documents_and_fields || requirementsData.documents_and_fields.length === 0) {
          setLetterTypes([]);
          return;
        }
        
        const documentIds = requirementsData.documents_and_fields.map(df => df.id.split('_')[0]);

        if (documentIds.length === 0) {
          setLetterTypes([]);
          return;
        }

        const { data: lettersData, error: lettersError } = await supabase
          .from('acc_portal_kyc')
          .select('*')
          .in('id', documentIds)
          .eq('main_category', 'Letters');
        
        if (lettersError) throw lettersError;

        setLetterTypes(lettersData || []);

      } catch (error) {
        console.error("Error fetching letter types for class:", error);
        setLetterTypes([]);
        toast({ title: "Error", description: "Could not load associated letter types.", variant: "destructive" });
      } finally {
        setIsLoading(false);
      }
    };

    fetchLetterTypesForClass();
  }, [selectedDepartment, selectedSubdepartment, selectedClass, selectedSubclass, constructedClassId]);


  // --- Event Handlers for Sidebar ---
  const handleDeptClick = (deptId: string) => { setSelectedDepartment(deptId); setSelectedSubdepartment(''); setSelectedClass(''); setSelectedSubclass(''); };
  const handleSubdeptClick = (deptId: string, subdeptId: string) => { setSelectedDepartment(deptId); setSelectedSubdepartment(subdeptId); setSelectedClass(''); setSelectedSubclass(''); };
  const handleClassClick = (deptId: string, subdeptId: string, classId: string) => { setSelectedDepartment(deptId); setSelectedSubdepartment(subdeptId); setSelectedClass(classId); setSelectedSubclass(''); };
  const handleSubclassClick = (deptId: string, subdeptId: string, classId: string, subclassId: string) => { setSelectedDepartment(deptId); setSelectedSubdepartment(subdeptId); setSelectedClass(classId); setSelectedSubclass(subclassId); };

  // --- MODIFICATION: Event Handlers for Content & Dialog ---
  const handleTemplateUpdate = () => setTemplateVersion(v => v + 1);

  const handleCreateNewTemplate = () => {
    setEditingTemplate(null); // Ensure we're not in edit mode
    setTemplateDialogOpen(true);
  };
  
  const handleEditTemplate = (template: any) => {
    setEditingTemplate(template); // Set the template to edit
    setTemplateDialogOpen(true);
  };

  const closeTemplateDialog = () => {
    setTemplateDialogOpen(false);
    setEditingTemplate(null); // Always reset on close
  };

  // --- Memoized Breadcrumb ---
  const breadcrumb = useMemo(() => {
    const d = departments.find(d => String(d.id) === selectedDepartment);
    const sd = d?.tm_subdepartments?.find(s => String(s.id) === selectedSubdepartment);
    const c = sd?.classes?.find(c => String(c.id) === selectedClass);
    const sc = c?.subClasses?.find(sc => String(sc.id) === selectedSubclass);
    return [d, sd, c, sc].filter(Boolean).map(item => item.name).join(' > ');
  }, [departments, selectedDepartment, selectedSubdepartment, selectedClass, selectedSubclass]);


  return (
    <div className="flex h-[calc(100vh-theme(spacing.16))] bg-slate-50/50">
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
      />

      <main className="flex-1 overflow-hidden p-6 space-y-6">
        <header>
          <h1 className="text-3xl font-bold tracking-tight">Letter Template Management</h1>
          <p className="text-muted-foreground">{breadcrumb || 'Select a department to begin'}</p>
        </header>

        {isLoading && (!selectedClass && !selectedSubclass) ? (
          <div className="flex justify-center items-center h-2/3"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
        ) : !selectedClass && !selectedSubclass ? (
          <Card className="mt-8">
            <CardHeader><CardTitle>Select a Class</CardTitle><CardDescription>Choose a class or subclass from the sidebar to view its associated letter types.</CardDescription></CardHeader>
            <CardContent className="text-center py-12"><FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" /></CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-12 gap-6 h-[calc(100%-80px)]">
            <Card className="col-span-4 h-full flex flex-col">
              <CardHeader><CardTitle>Letter Types</CardTitle><CardDescription>Letters required for this class.</CardDescription></CardHeader>
              <CardContent className="flex-1 overflow-hidden p-2">
                <ScrollArea className="h-full">
                  {isLoading ? (
                    <div className="flex justify-center items-center h-full"><Loader2 className="h-6 w-6 animate-spin" /></div>
                  ) : letterTypes.length > 0 ? (
                    letterTypes.map(letter => (
                      <Button key={letter.id} variant={selectedLetter?.id === letter.id ? 'secondary' : 'ghost'} className="w-full justify-between h-auto py-2 px-3 mb-1" onClick={() => setSelectedLetter(letter)}>
                        <span className="text-left font-medium">{letter.display_name}</span>
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    ))
                  ) : (
                    <div className="text-center py-10 text-sm text-muted-foreground">No letter types found for the selected class.</div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>

            <div className="col-span-8 h-full">
              {selectedLetter ? (
                // --- MODIFICATION: Pass new handlers to the display area ---
                <TemplateDisplayArea
                  key={`${selectedLetter.id}-${templateVersion}`} // Key update ensures re-fetch
                  selectedLetter={selectedLetter}
                  onCreateNew={handleCreateNewTemplate}
                  onEdit={handleEditTemplate} // Pass the edit handler
                  templateVersion={templateVersion}
                />
              ) : (
                <Card className="h-full flex items-center justify-center">
                  <div className="text-center">
                    <h3 className="text-lg font-medium">Select a Letter Type</h3>
                    <p className="text-sm text-muted-foreground mt-1">Choose a letter from the left panel to see its templates.</p>
                  </div>
                </Card>
              )}
            </div>
          </div>
        )}
      </main>

      {selectedLetter && (
        // --- MODIFICATION: Pass the template data to the manager ---
        <DocumentTemplateManager
          document={selectedLetter}
          isOpen={templateDialogOpen}
          onClose={closeTemplateDialog}
          onTemplateUpdate={handleTemplateUpdate}
          classId={constructedClassId}
          // If editingTemplate exists, pass it in an array to initialize the manager
          initialTemplates={editingTemplate ? [editingTemplate] : []}
        />
      )}
    </div>
  );
}


// --- MODIFICATION: Accept and use the onEdit handler ---
function TemplateDisplayArea({ selectedLetter, onCreateNew, onEdit, templateVersion }) {
  const [templates, setTemplates] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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
        setTemplates(data || []);
      } catch (error) {
        console.error(`Error fetching templates for ${selectedLetter.id}:`, error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchTemplates();
  }, [selectedLetter, templateVersion]);

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle>{selectedLetter.display_name}</CardTitle>
          <CardDescription>Available templates for this letter.</CardDescription>
        </div>
        <Button onClick={onCreateNew}>
          <PlusCircle className="mr-2 h-4 w-4" /> Create New
        </Button>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center items-center h-full"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : templates.length > 0 ? (
          <ScrollArea className="h-full pr-4">
            <div className="space-y-4">
              {templates.map(template => (
                <Card key={template.id} className="shadow-sm">
                  <CardHeader>
                    <CardTitle className="flex justify-between items-center text-lg">
                      {/* Note: The DB column is `file_name`, not `name` */}
                      {template.file_name}
                      {/* --- MODIFICATION: Attach the onEdit handler --- */}
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => onEdit(template)}>
                        <Settings className="h-4 w-4" />
                      </Button>
                    </CardTitle>
                    <CardDescription>
                      {template.description || `Type: ${template.file_type === 'text/html' ? 'Text Editor' : 'DOCX File'}`}
                    </CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </div>
          </ScrollArea>
        ) : (
          <div className="h-full flex items-center justify-center text-center border-2 border-dashed rounded-lg">
            <div>
              <h3 className="text-lg font-medium">No Templates Found</h3>
              <p className="text-sm text-muted-foreground mt-1">Get started by creating the first template.</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}