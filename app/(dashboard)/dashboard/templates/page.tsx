// @ts-nocheck
"use client"

import React, { useState, useMemo, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { PlusCircle, FileText, Loader2, Settings, ChevronRight, Trash2, Building2, Check, ChevronsUpDown, X, ChevronDown } from "lucide-react"
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
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"

import { DepartmentSidebar } from "../departments/main-shared-components/department-sidebar"
import { fetchDepartments } from "../departments/departments/database"
import DocumentTemplateManager from "./document-template-manager"

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
  const [selectedBank, setSelectedBank] = useState<any | null>(null); // NEW STATE
  const [isLoading, setIsLoading] = useState(true);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<any | null>(null);
  const [templateVersion, setTemplateVersion] = useState(0);
  const [isBankDialogOpen, setIsBankDialogOpen] = useState(false);
  const [expandedLetterIds, setExpandedLetterIds] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const performInitialLoad = async () => {
      setIsLoading(true);
      const departmentsData = await fetchDepartments();
      setDepartments(departmentsData);
      setIsLoading(false);
    };
    performInitialLoad();
  }, []);

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

    if (subclassId) return { level: 4, department_id: deptId, subdepartment_id: subDeptId, class_id: classId, subclass_id: subclassId };
    if (classId) return { level: 3, department_id: deptId, subdepartment_id: subDeptId, class_id: classId, subclass_id: null };
    return null;
  }, [selectedDepartment, selectedSubdepartment, selectedClass, selectedSubclass]);

  useEffect(() => {
  const fetchLetterTypesForClass = async () => {
    // 1. Ensure we have enough data to identify the hierarchy
    if (!jobLevelObject || !selectedClass) {
      setLetterTypes([]);
      setSelectedLetter(null);
      setSelectedBank(null);
      return;
    }

    setIsLoading(true);
    try {
      // 2. Fetch requirements using the job_level JSONB column filters
      let query = supabase
        .from('tm_class_requirements')
        .select('documents_and_fields')
        .eq('job_level->>department_id', jobLevelObject.department_id.toString())
        .eq('job_level->>subdepartment_id', jobLevelObject.subdepartment_id.toString())
        .eq('job_level->>class_id', jobLevelObject.class_id.toString());

      // Handle subclass (use .is() for null values in JSONB)
      if (jobLevelObject.subclass_id) {
        query = query.eq('job_level->>subclass_id', jobLevelObject.subclass_id.toString());
      } else {
        query = query.is('job_level->>subclass_id', null);
      }

      const { data: requirementsData, error: requirementsError } = await query.maybeSingle();

      if (requirementsError) throw requirementsError;

      if (!requirementsData?.documents_and_fields || requirementsData.documents_and_fields.length === 0) {
        setLetterTypes([]);
        return;
      }

      // 3. Extract IDs and fetch the actual KYC document definitions
      const documentIds = requirementsData.documents_and_fields.map(df => df.id);

      let { data: documentsData, error: documentsError } = await supabase
        .from('acc_portal_kyc')
        .select('*')
        .in('id', documentIds)

      if (documentsError) throw documentsError;
      
      setLetterTypes(documentsData || []);
    } catch (error) {
      console.error("Error fetching letter types:", error);
      setLetterTypes([]);
    } finally {
      setIsLoading(false);
    }
  };
  
  // Dependency change: depend on jobLevelObject instead of constructedClassId
  fetchLetterTypesForClass();
}, [jobLevelObject, selectedClass]);

const handleLetterClick = (letter: any) => {
    const hasBanks = letter.banks_applicable && letter.banks_applicable.length > 0;
    
    if (hasBanks) {
      // If it has banks, just toggle expansion
      setExpandedLetterIds(prev => ({
        ...prev,
        [letter.id]: !prev[letter.id]
      }));
    } else {
      // If no banks, this is the final selectable item
      setSelectedLetter(letter);
      setSelectedBank(null);
    }
  };

  const handleBankClick = (letter: any, bank: any) => {
    setSelectedLetter(letter);
    setSelectedBank(bank);
  };

  const handleDeptClick = (deptId: string) => { setSelectedDepartment(deptId); setSelectedSubdepartment(''); setSelectedClass(''); setSelectedSubclass(''); };
  const handleSubdeptClick = (deptId: string, subdeptId: string) => { setSelectedDepartment(deptId); setSelectedSubdepartment(subdeptId); setSelectedClass(''); setSelectedSubclass(''); };
  const handleClassClick = (deptId: string, subdeptId: string, classId: string) => { setSelectedDepartment(deptId); setSelectedSubdepartment(subdeptId); setSelectedClass(classId); setSelectedSubclass(''); };
  const handleSubclassClick = (deptId: string, subdeptId: string, classId: string, subclassId: string) => { setSelectedDepartment(deptId); setSelectedSubdepartment(subdeptId); setSelectedClass(classId); setSelectedSubclass(subclassId); };

  const handleTemplateUpdate = () => setTemplateVersion(v => v + 1);
  const handleCreateNewTemplate = () => { setEditingTemplate(null); setTemplateDialogOpen(true); };
  const handleEditTemplate = (template: any) => { setEditingTemplate(template); setTemplateDialogOpen(true); };
  const closeTemplateDialog = () => { setTemplateDialogOpen(false); setEditingTemplate(null); };

  const breadcrumb = useMemo(() => {
    const d = departments.find(d => String(d.id) === selectedDepartment);
    const sd = d?.tm_subdepartments?.find(s => String(s.id) === selectedSubdepartment);
    const c = sd?.classes?.find(c => String(c.id) === selectedClass);
    const sc = c?.subClasses?.find(sc => String(sc.id) === selectedSubclass);
    return [d, sd, c, sc].filter(Boolean).map(item => item.name).join(' > ');
  }, [departments, selectedDepartment, selectedSubdepartment, selectedClass, selectedSubclass]);

  const toggleLetterExpansion = (e: React.MouseEvent, letterId: string) => {
    e.stopPropagation(); // Prevent selecting the letter when just toggling the chevron
    setExpandedLetterIds(prev => ({
      ...prev,
      [letterId]: !prev[letterId]
    }));
  };

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
          <h1 className="text-3xl font-bold tracking-tight">Template Management</h1>
          <p className="text-muted-foreground">{breadcrumb || 'Select a department to begin'}</p>
        </header>

        {isLoading && (!selectedClass && !selectedSubclass) ? (
          <div className="flex justify-center items-center h-2/3"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
        ) : !selectedClass && !selectedSubclass ? (
          <Card className="mt-8">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Select a Class</CardTitle>
                <CardDescription>Choose a class from the sidebar.</CardDescription>
              </div>
              {String(selectedDepartment) === "14" && (
                <Button variant="outline" className="gap-2" onClick={() => setIsBankDialogOpen(true)}>
                  <Building2 className="h-4 w-4" /> Add Bank Compatibility
                </Button>
              )}
            </CardHeader>
            <CardContent className="text-center py-12"><FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" /></CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-12 gap-6 h-[calc(100%-80px)]">
            <Card className="col-span-4 h-full flex flex-col">
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle>Template Types</CardTitle>
                  <CardDescription>Required templates.</CardDescription>
                </div>
                {String(selectedDepartment) === "14" && (
                  <Button variant="outline" size="sm" className="h-8 gap-1" onClick={() => setIsBankDialogOpen(true)}>
                    <Building2 className="h-4 w-4" /> Add Bank
                  </Button>
                )}
              </CardHeader>
              
            <CardContent className="flex-1 overflow-hidden p-2">
                <ScrollArea className="h-full">
                  {isLoading ? (
                    <div className="flex justify-center items-center h-full"><Loader2 className="h-6 w-6 animate-spin" /></div>
                  ) : letterTypes.length > 0 ? (
                    <div className="space-y-1">
                      {letterTypes.filter(letter => letter.has_template === "true").map(letter => {
                        const hasBanks = letter.banks_applicable && letter.banks_applicable.length > 0;
                        const isExpanded = expandedLetterIds[letter.id];
                        // Active if selected and NO bank is involved
                        const isDocActive = selectedLetter?.id === letter.id && !selectedBank;

                        return (
                          <div key={letter.id} className="flex flex-col">
                            <div 
                              className={cn(
                                "flex items-center w-full rounded-md transition-colors hover:bg-accent group",
                                isDocActive ? "bg-secondary text-secondary-foreground" : "transparent"
                              )}
                            >
                              <Button
                                variant="ghost"
                                size="icon"
                                className={cn("h-8 w-8 shrink-0", !hasBanks && "opacity-0 pointer-events-none")}
                                onClick={(e) => hasBanks && toggleLetterExpansion(e, letter.id)}
                              >
                                {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                              </Button>

                              <button
                                className="flex-1 py-2 pr-3 text-left text-sm font-medium outline-none"
                                onClick={() => handleLetterClick(letter)}
                              >
                                {letter.display_name}
                              </button>
                            </div>

                            {/* Expanded Bank List */}
                            {isExpanded && hasBanks && (
                              <div className="ml-4 mt-1 mb-2 space-y-1 border-l-2 border-muted pl-4">
                                {letter.banks_applicable.map(bank => {
                                  const isBankActive = selectedBank?.bank_id === bank.bank_id;
                                  return (
                                    <button
                                      key={bank.bank_id}
                                      onClick={() => handleBankClick(letter, bank)}
                                      className={cn(
                                        "flex items-center gap-2 w-full text-left px-2 py-1.5 rounded-sm text-xs transition-colors",
                                        isBankActive 
                                          ? "bg-primary/10 text-primary font-semibold" 
                                          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                                      )}
                                    >
                                      <Building2 className="h-3.5 w-3.5" />
                                      <span>{bank.bank_name}</span>
                                      {isBankActive && <Check className="ml-auto h-3 w-3" />}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-10 text-sm text-muted-foreground">No template types found.</div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>

            <div className="col-span-8 h-full">
              {selectedLetter ? (
                 <TemplateDisplayArea
                  key={`${selectedLetter.id}-${selectedBank?.bank_id || 'none'}-${templateVersion}`}
                  selectedLetter={selectedLetter}
                  selectedBank={selectedBank} 
                  jobLevel={jobLevelObject}
                  onCreateNew={() => handleCreateNewTemplate()}
                  onEdit={handleEditTemplate}
                  templateVersion={templateVersion}
                />
              ) : (
                <Card className="h-full flex items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <FileText className="h-10 w-10 mx-auto mb-2 opacity-20" />
                    <h3 className="text-lg font-medium">Select a Document or Bank</h3>
                    <p className="text-sm">Choose an item from the sidebar to view templates.</p>
                  </div>
                </Card>
              )}
            </div>
          </div>
        )}
      </main>
      {selectedLetter && (
        <DocumentTemplateManager
          document={selectedLetter}
          isOpen={templateDialogOpen}
          onClose={closeTemplateDialog}
          onTemplateUpdate={handleTemplateUpdate}
          jobLevel={jobLevelObject}
          selectedBank={selectedBank} 
          initialTemplates={editingTemplate ? [editingTemplate] : []}
        />
      )}

      <BankAssociationDialog
        isOpen={isBankDialogOpen}
        onClose={() => setIsBankDialogOpen(false)}
        letterTypes={letterTypes}
      />
    </div>
  );
}

/**
 * UPDATED COMPONENT: BankAssociationDialog
 * Stores data in acc_portal_kyc.banks_applicable JSON column
 */
function BankAssociationDialog({ isOpen, onClose, letterTypes }) {
  const [banks, setBanks] = useState<any[]>([]);
  const [mappings, setMappings] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) fetchData();
  }, [isOpen, letterTypes]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: banksData } = await supabase.from('banks').select('id, bank_name').order('bank_name');
      setBanks(banksData || []);

      const mappingObj: Record<string, any[]> = {};
      letterTypes.forEach(doc => {
        mappingObj[doc.id] = Array.isArray(doc.banks_applicable) ? doc.banks_applicable : [];
      });
      setMappings(mappingObj);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (docId: string, bank: any) => {
    setMappings(prev => {
      const current = prev[docId] || [];
      const isSelected = current.some(b => b.bank_id === bank.id);

      const updated = isSelected
        ? current.filter(b => b.bank_id !== bank.id)
        : [...current, { bank_id: bank.id, bank_name: bank.bank_name }];

      return { ...prev, [docId]: updated };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updatePromises = Object.entries(mappings).map(([docId, selectedBanks]) => {
        return supabase
          .from('acc_portal_kyc')
          .update({ banks_applicable: selectedBanks })
          .eq('id', docId)
          .select('*')
          .single();
      });

      const results = await Promise.all(updatePromises);
      const updatedDocuments = results.map(result => result.data).filter(Boolean);

      // Update the local state with the updated documents
      setLetterTypes(prev =>
        prev.map(doc => {
          const updatedDoc = updatedDocuments.find(d => d.id === doc.id);
          return updatedDoc || doc;
        })
      );

      toast({ title: "Success", description: "Bank applicability updated." });
      onClose();
    } catch (error) {
      console.error(error);
      toast({ title: "Error", description: "Failed to save data.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Bank Compatibility Settings</DialogTitle>
          <DialogDescription>Select applicable banks for each document type.</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden py-4">
          {loading ? (
            <div className="flex items-center justify-center h-40"><Loader2 className="animate-spin" /></div>
          ) : (
            <ScrollArea className="h-full pr-4">
              <div className="space-y-4">
                {letterTypes.map(doc => (
                  <div key={doc.id} className="flex flex-col gap-2 p-3 border rounded-md">
                    <label className="text-sm font-semibold flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" /> {doc.display_name}
                    </label>

                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" role="combobox" className="justify-between w-full h-auto min-h-10 text-left font-normal">
                          <div className="flex flex-wrap gap-1">
                            {mappings[doc.id]?.length > 0 ? (
                              mappings[doc.id].map(b => (
                                <Badge key={b.bank_id} variant="secondary" className="mr-1">
                                  {b.bank_name}
                                </Badge>
                              ))
                            ) : (
                              <span className="text-muted-foreground">Select banks...</span>
                            )}
                          </div>
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[400px] p-0" align="start">
                        <Command>
                          <CommandInput placeholder="Search bank..." />
                          <CommandList>
                            <CommandEmpty>No bank found.</CommandEmpty>
                            <CommandGroup>
                              {banks.map((bank) => (
                                <CommandItem
                                  key={bank.id}
                                  onSelect={() => handleSelect(doc.id, bank)}
                                >
                                  <div className={cn(
                                    "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                                    mappings[doc.id]?.some(b => b.bank_id === bank.id)
                                      ? "bg-primary text-primary-foreground"
                                      : "opacity-50 [&_svg]:invisible"
                                  )}>
                                    <Check className={cn("h-4 w-4")} />
                                  </div>
                                  {bank.bank_name}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Compatibility
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
    <Card key={template.id} className="shadow-sm">
      <CardHeader>
        <CardTitle className="flex justify-between items-center text-lg">
          {template.file_name}
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => onEdit(template)}>
              <Settings className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                setShowDeleteDialog(true);
              }}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
            </Button>
          </div>

          <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete the "{template.file_name}" template. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  className="bg-destructive hover:bg-destructive/90"
                  disabled={isDeleting}
                >
                  {isDeleting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Deleting...
                    </>
                  ) : 'Delete'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardTitle>
        <CardDescription className="flex flex-col gap-2">
          <div className="flex">
            {template.entity_types && template.entity_types.length > 0
              ? template.entity_types.map(et => <Badge key={et} variant="outline" className="capitalize">{et}</Badge>)
              : <Badge variant="outline">Uncategorized</Badge>
            }
          </div>
          {template.description || `Type: ${template.file_type === 'text/html' ? 'Text Editor' : 'DOCX File'}`}
        </CardDescription>
      </CardHeader>
    </Card>
  );
}

function TemplateDisplayArea({ selectedLetter, selectedBank, onCreateNew, onEdit, templateVersion, jobLevel }) {
  const [allTemplates, setAllTemplates] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

// Inside TemplateDisplayArea component in LettersPage.tsx

useEffect(() => {
  const fetchTemplates = async () => {
    if (!selectedLetter) return;
    setIsLoading(true);
    try {
      let query = supabase
        .from('acc_portal_templates')
        .select('*')
        .eq('document_id', selectedLetter.id);

      if (selectedBank) {
        // We use .filter with 'cs' (contains) and manually stringify the JSON.
        // This ensures Supabase sends a JSON string "[...]" instead of an Array string "{...}"
        const jsonFilter = JSON.stringify([{ bank_id: selectedBank.bank_id }]);
        query = query.filter('banks_associated', 'cs', jsonFilter);
      } else {
        // Fetch generic templates (where column is null or an empty JSON array)
        // Note: For JSONB, .eq.'[]' is the correct way to check for an empty array
        query = query.or('banks_associated.is.null,banks_associated.eq.[]');
      }

      const { data, error } = await query.order('file_name', { ascending: true });

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
}, [selectedLetter, selectedBank, templateVersion]);

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

  // 3. Categorize for Tabs
  const categorizedTemplates = useMemo(() => {
    const categorized = { all: filteredTemplates, uncategorized: [] };
    const tabs = new Set<string>();

    filteredTemplates.forEach(template => {
      let entityTypes = template.entity_types;
      // Handle stringified JSON if necessary
      if (typeof entityTypes === 'string') {
        try { entityTypes = JSON.parse(entityTypes); } catch { }
      }

      if (Array.isArray(entityTypes) && entityTypes.length > 0) {
        entityTypes.forEach(type => {
          tabs.add(type);
          if (!categorized[type]) categorized[type] = [];
          categorized[type].push(template);
        });
      } else {
        categorized.uncategorized.push(template);
      }
    });

    const sortedTabs = Array.from(tabs).sort();
    return { tabs: sortedTabs, categorized };
  }, [filteredTemplates]);

  return (
     <Card className="h-full flex flex-col">
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            {selectedLetter.display_name}
            {selectedBank && (
              <>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                <span className="text-primary">{selectedBank.bank_name}</span>
              </>
            )}
          </CardTitle>
          <CardDescription>
            {selectedBank 
              ? `Templates specific to ${selectedBank.bank_name}` 
              : "Generic templates for this document type."}
          </CardDescription>
        </div>
        <Button onClick={onCreateNew}>
          <PlusCircle className="mr-2 h-4 w-4" /> Create New
        </Button>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center items-center h-full"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : filteredTemplates.length > 0 ? (
          <Tabs defaultValue="all" className="flex flex-col h-full">
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              {categorizedTemplates.tabs.map(tab => (
                <TabsTrigger key={tab} value={tab} className="capitalize">{tab}</TabsTrigger>
              ))}
              {categorizedTemplates.categorized.uncategorized.length > 0 && (
                <TabsTrigger value="uncategorized">Uncategorized</TabsTrigger>
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