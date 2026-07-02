// @ts-nocheck
'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import React, { useEffect, useState, useMemo, useRef, useCallback } from "react"
import { cn } from "@/lib/utils"
import { Pencil, Trash2, ArrowUp, ArrowDown, Plus, X, Check, PanelLeft, LayoutGrid, ChevronRight, ChevronDown, FileText, Layers, AlertTriangle, Eye, EyeOff, Zap, FileType, Database, Code, HelpCircle, Folder, Split, Building2, ChevronsUpDown } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Checkbox } from "@/components/ui/checkbox"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import supabase from "@/lib/supabase/client"
import { toast } from "@/lib/hooks/use-toast"
import { DepartmentSidebar } from "@/app/(dashboard)/dashboard/departments/main-shared-components/department-sidebar"
import { EditRequirementDialog } from "./components/EditRequirementDialog"
import { AddRequirementsDialog } from "./components/AddRequirementsDialog"
import { EditJobQuestionDialog } from "./components/EditJobQuestionDialog"
import { COMPUTED_FUNCTIONS } from "@/lib/constants/computed-functions"
import { ENTITY_TYPES, type EntityType } from "@/lib/constants/entity-types"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup
} from "@/components/ui/resizable"

interface Department {
  id: string | number
  name: string
  description?: string
  tm_subdepartments?: Subdepartment[]
}

interface Subdepartment {
  id: string | number
  name: string
  description?: string
  classes?: Class[]
  upload_requirements?: ApiRequirement[]
  job_specific_questions?: JobQuestion[]
}

interface Class {
  id: string | number
  name: string
  description?: string
  requirements?: ApiRequirement[]
  job_specific_questions?: JobQuestion[]
  subClasses?: Subclass[]
}

interface Subclass {
  id: string | number
  name: string
  description?: string
  requirements?: ApiRequirement[]
  job_specific_questions?: JobQuestion[]
}

interface EditingContext {
  type: 'subdepartment' | 'class' | 'subclass'
  departmentId: string | number
  subdepartmentId: string | number
  subdepartmentName?: string
  classId?: string | number
  className?: string
  subclassId?: string | number
  subclassName?: string
  jobLevel?: {
    department_id: string | number
    subdepartment_id: string | number
    class_id: string | number | null
    subclass_id: string | number | null
  }
}

interface WebDataField {
  id: string;
  name: string;
  variableName: string;
  fieldType: string;
  entityType: string;
  masterFieldIds?: string[];
  is_client_requirement?: boolean;
}

interface JobQuestion {
  id: string
  label: string
  type: string
  required: boolean
  options?: string[]
  linked_field_id?: string
  entityTypes?: EntityType[]
  default_value?: string // Matches DB column name
  order: number
  linkedToColumn?: 'duration' | 'renewal_status' | null // Links question answer to direct task column
}

interface ApiRequirement {
  id?: string
  name: string
  description?: string
  type: 'standard' | 'conditional' | 'optional' | 'company' | 'multi-document'
  order: number
  isVisible: boolean
  isRequired: boolean
  document_ids?: string[]
  hasWebForm?: boolean
  webFormName?: string
  automationId?: string
  entityTypes?: EntityType[]
  requiredDocumentCount?: number
  billingEntity?: string
  instructions?: string
  requirement_context?: any
  web_automation?: any
  category?: 'general' | 'processing' | 'issuance' | 'reference'
  webdata?: WebDataField[]
  inherit_from_parent?: boolean
  is_client_requirement?: boolean
}

interface RequirementTableEntry extends ApiRequirement {
  tempId?: string
}

export default function UploadRequirements({ departments: initialDepartments }: { departments: Department[] }) {
  const [departments, setDepartments] = useState<Department[]>(initialDepartments || [])
  const [activeDept, setActiveDept] = useState<string>('')
  const [activeSubdept, setActiveSubdept] = useState<Record<string, string>>({})
  const [activeClass, setActiveClass] = useState<Record<string, string>>({})
  const [activeSubclass, setActiveSubclass] = useState<Record<string, string>>({})
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({})
  const [expandedWebDataRows, setExpandedWebDataRows] = useState<Set<string>>(new Set())
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [editingRequirement, setEditingRequirement] = useState<ApiRequirement | null>(null)
  const [isEditQuestionDialogOpen, setIsEditQuestionDialogOpen] = useState(false)
  const [editingQuestion, setEditingQuestion] = useState<JobQuestion | null>(null)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [addContext, setAddContext] = useState<EditingContext | null>(null)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [deleteContext, setDeleteContext] = useState<{ type: string, index: number, requirementId?: string, isQuestion?: boolean } | null>(null)
  const [editingContext, setEditingContext] = useState<EditingContext | null>(null)
  const [kycDocuments, setKycDocuments] = useState<any[]>([])
  const [masterFields, setMasterFields] = useState<any[]>([])
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [banks, setBanks] = useState<any[]>([]);
  const [selectedBank, setSelectedBank] = useState<any | null>(null);
  const [disabledInheritedReqs, setDisabledInheritedReqs] = useState<Set<string>>(new Set());
  const [allAutomations, setAllAutomations] = useState<{ id: string; name: string; webdata: WebDataField[]; is_active?: boolean }[]>([]);
  const [expandedAutomationConfig, setExpandedAutomationConfig] = useState<Set<string>>(new Set());
  const sidebarPanelRef = useRef(null);

  // Add the programmatic toggle handler
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

  const activeSelection = useMemo(() => {
    const currentDept = departments.find(d => String(d.id) === String(activeDept))
    if (!currentDept) return { reqs: [], questions: [] }

    const currentSubdeptId = activeSubdept[String(currentDept.id)]
    const currentSubdept = currentDept.subdepartments?.find(s => String(s.id) === String(currentSubdeptId)) ||
      currentDept.tm_subdepartments?.find(s => String(s.id) === String(currentSubdeptId))

    if (!currentSubdept) return { currentDept, reqs: [], questions: [] }

    const activeClassKey = `${String(currentDept.id)}-${String(currentSubdept.id)}`
    const currentClassId = activeClass[activeClassKey]
    const currentClass = currentSubdept.classes?.find(c => String(c.id) === String(currentClassId))

    const activeSubclassKey = `${activeClassKey}-${String(currentClassId)}`
    const currentSubclassId = activeSubclass[activeSubclassKey]
    const currentSubclass = currentClass?.subClasses?.find(sc => String(sc.id) === String(currentSubclassId))

    const reqs = (currentSubclass ? currentSubclass.requirements : currentClass ? currentClass.requirements : currentSubdept.upload_requirements) || []
    const questions = (currentSubclass ? currentSubclass.job_specific_questions : currentClass ? currentClass.job_specific_questions : currentSubdept.job_specific_questions) || []

    return { currentDept, currentSubdept, currentClass, currentSubclass, reqs, questions }
  }, [departments, activeDept, activeSubdept, activeClass, activeSubclass])

  // --- 2. DESTUCTURE FOR DIALOGS (Solves 'is not defined' error) ---
  const { currentDept, currentSubdept, currentClass, currentSubclass, reqs, questions } = activeSelection

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [kycRes, mfRes, banksRes, automationsRes] = await Promise.all([
          supabase.from('acc_portal_kyc').select('id, name, display_name').order('name'),
          supabase.from('tm_job_fields').select('id, label'),
          supabase.from('banks').select('id, bank_name').order('bank_name'),
          supabase.from('tm_automations').select('id, name, webdata, is_active').order('name')
        ])
        setKycDocuments(kycRes.data || [])
        setMasterFields(mfRes.data || [])
        setBanks(banksRes.data || [])
        setAllAutomations(automationsRes.data || [])
      } catch (error) { console.error(error) }
    }
    fetchData()
  }, [])

  const mapRequirementsData = async (record: any) => {
    if (!record || !record.requirements) return []
    return record.requirements.map((r: any) => ({
      ...r,
      entityTypes: r.entityTypes || [],
      document_ids: r.document_ids || (r.documentId ? [r.documentId] : []),
    }))
  }

  const toggleWebDataRow = (reqId: string) => {
    setExpandedWebDataRows(prev => {
      const next = new Set(prev)
      if (next.has(reqId)) {
        next.delete(reqId)
      } else {
        next.add(reqId)
      }
      return next
    })
  }

  // Helper function to get document names
  const getDocumentNames = (documentIds: string[] | undefined) => {
    if (!documentIds || !Array.isArray(documentIds)) return []
    return documentIds.map(id => {
      const doc = kycDocuments.find(d => d.id === id)
      return doc?.display_name || doc?.name || `Document ${id}`
    })
  }

  useEffect(() => {
    if (departments.length > 0 && !activeDept) {
      const firstDept = departments[0]
      setActiveDept(String(firstDept.id))

      if (firstDept.tm_subdepartments && firstDept.tm_subdepartments.length > 0) {
        const firstSub = firstDept.tm_subdepartments[0]
        setActiveSubdept({ [String(firstDept.id)]: String(firstSub.id) })
      }
    }
  }, [departments, activeDept])

  const refreshDepartments = async () => {
    try {
      const { data: departmentsData } = await supabase
        .from('tm_departments')
        .select('*, tm_subdepartments(*)')
        .order('order', { ascending: true })

      const { data: allReqRecords } = await supabase.from('tm_class_requirements').select('*')

      const processedDepartments = await Promise.all((departmentsData || []).map(async (dept) => {
        const resolvedSubdepartments = await Promise.all((dept.tm_subdepartments || []).map(async (subdept) => {

          const findRecord = (cId: string | null, scId: string | null) => {
            return allReqRecords?.find(r => {
              const job = r.job_level || {}
              return String(job.department_id) === String(dept.id) &&
                String(job.subdepartment_id) === String(subdept.id) &&
                String(job.class_id || 'null') === String(cId || 'null') &&
                String(job.subclass_id || 'null') === String(scId || 'null')
            })
          }

          const resolvedClasses = await Promise.all((subdept.classes || []).map(async (cls) => {
            const classRec = findRecord(String(cls.id), null)
            const resolvedSubClasses = await Promise.all((cls.subClasses || []).map(async (subCls) => {
              const subClsRec = findRecord(String(cls.id), String(subCls.id))
              return {
                ...subCls,
                requirements: await mapRequirementsData(subClsRec),
                job_specific_questions: subClsRec?.job_specific_questions || []
              }
            }))
            return {
              ...cls,
              requirements: await mapRequirementsData(classRec),
              job_specific_questions: classRec?.job_specific_questions || [],
              subClasses: resolvedSubClasses
            }
          }))

          const subDeptRec = findRecord(null, null)
          return {
            ...subdept,
            classes: resolvedClasses,
            upload_requirements: await mapRequirementsData(subDeptRec),
            job_specific_questions: subDeptRec?.job_specific_questions || []
          }
        }))
        // IMPORTANT: Populate both tm_subdepartments AND subdepartments for sidebar compatibility
        return {
          ...dept,
          tm_subdepartments: resolvedSubdepartments,
          subdepartments: resolvedSubdepartments
        }
      }))
      setDepartments(processedDepartments)
    } catch (error) { setDepartments([]) }
  }

  const handleMoveItem = async (
    type: 'requirement' | 'question',
    currentIndex: number,
    direction: 'up' | 'down',
    context: EditingContext
  ) => {
    try {
      setIsSubmitting(true);
      const jobLevel = {
        department_id: Number(context.departmentId),
        subdepartment_id: Number(context.subdepartmentId),
        class_id: context.classId ? Number(context.classId) : null,
        subclass_id: context.subclassId ? Number(context.subclassId) : null,
        level: context.type === 'subdepartment' ? 2 : context.type === 'class' ? 3 : 4
      };

      const { data: existing } = await supabase
        .from('tm_class_requirements')
        .select('*')
        .eq('job_level', JSON.stringify(jobLevel))
        .maybeSingle();

      if (!existing) return;

      // Determine which array we are working with
      const fieldName = type === 'requirement' ? 'requirements' : 'job_specific_questions';
      let items = [...(existing[fieldName] || [])];

      // Swap Logic
      const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
      if (targetIndex < 0 || targetIndex >= items.length) return;

      // Swap elements
      [items[currentIndex], items[targetIndex]] = [items[targetIndex], items[currentIndex]];

      // Re-assign order property based on new array index
      const reorderedItems = items.map((item, idx) => ({ ...item, order: idx }));

      const { error } = await supabase
        .from('tm_class_requirements')
        .update({ [fieldName]: reorderedItems, updated_at: new Date().toISOString() })
        .eq('id', existing.id);

      if (error) throw error;

      await refreshDepartments();
      toast({ title: "Order Updated" });
    } catch (error) {
      console.error(error);
      toast({ title: "Error", description: "Failed to update order", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => { refreshDepartments() }, [])

  const handleDeptClick = (deptId: string) => setActiveDept(String(deptId))
  const handleSubdeptClick = (deptId: string, subdeptId: string) => {
    setActiveSubdept(prev => ({ ...prev, [String(deptId)]: String(subdeptId) }))
    setActiveDept(String(deptId))
  }
  const handleClassClick = (deptId: string, subdeptId: string, classId: string) => {
    const key = `${String(deptId)}-${String(subdeptId)}`
    setActiveClass(prev => ({ ...prev, [key]: String(classId) }))
    setActiveSubdept(prev => ({ ...prev, [String(deptId)]: String(subdeptId) }))
    setActiveDept(String(deptId))
  }

  const handleSubclassClick = (deptId: string, subdeptId: string, classId: string, subclassId: string) => {
    const activeClassKey = `${String(deptId)}-${String(subdeptId)}`
    const activeSubclassKey = `${activeClassKey}-${String(classId)}`
    setActiveSubclass(prev => ({ ...prev, [activeSubclassKey]: String(subclassId) }))
    setActiveClass(prev => ({ ...prev, [activeClassKey]: String(classId) }))
    setActiveSubdept(prev => ({ ...prev, [String(deptId)]: String(subdeptId) }))
    setActiveDept(String(deptId))
  }

  const renderMainContent = () => {
    const { currentDept, currentSubdept, currentClass, currentSubclass, reqs, questions } = activeSelection
    if (!currentDept) return <div className="p-10 text-center text-gray-400">Select a department from the sidebar to begin.</div>
    if (!currentSubdept) return <div className="p-8 font-bold text-slate-400">Please select a sub-department.</div>

    const targetContext: EditingContext = currentSubclass
      ? { type: 'subclass', departmentId: currentDept.id, subdepartmentId: currentSubdept.id, classId: currentClass.id, subclassId: currentSubclass.id, subdepartmentName: currentSubdept.name, className: currentClass.name, subclassName: currentSubclass.name, jobLevel: { department_id: currentDept.id, subdepartment_id: currentSubdept.id, class_id: currentClass.id, subclass_id: currentSubclass.id } }
      : currentClass
        ? { type: 'class', departmentId: currentDept.id, subdepartmentId: currentSubdept.id, classId: currentClass.id, subdepartmentName: currentSubdept.name, className: currentClass.name, jobLevel: { department_id: currentDept.id, subdepartment_id: currentSubdept.id, class_id: currentClass.id, subclass_id: null } }
        : { type: 'subdepartment', departmentId: currentDept.id, subdepartmentId: currentSubdept.id, subdepartmentName: currentSubdept.name, jobLevel: { department_id: currentDept.id, subdepartment_id: currentSubdept.id, class_id: null, subclass_id: null } }

    return (
      <div className="space-y-8 max-h-[calc(100vh-100px)] overflow-auto">
        {/* Bank Selector for BANKS Department */}
        {String(activeDept) === "14" && (
          <Card className="bg-blue-50 border-blue-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Building2 className="h-5 w-5 text-blue-600" />
                Bank Selection
              </CardTitle>
              <CardDescription>
                Select a bank to define bank-specific requirements and job questions.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-between bg-white">
                    {selectedBank ? (
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4" />
                        <span>{selectedBank.bank_name}</span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">Select a bank...</span>
                    )}
                    <ChevronsUpDown className="h-4 w-4 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[300px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search bank..." />
                    <CommandList>
                      <CommandEmpty>No bank found.</CommandEmpty>
                      <CommandGroup>
                        {banks.map((bank) => (
                          <CommandItem
                            key={bank.id}
                            onSelect={() => setSelectedBank(bank)}
                            className="flex items-center gap-2"
                          >
                            <div className={cn(
                              "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                              selectedBank?.id === bank.id
                                ? "bg-primary text-primary-foreground"
                                : "opacity-50 [&_svg]:invisible"
                            )}>
                              <Check className="h-4 w-4" />
                            </div>
                            <Building2 className="h-4 w-4" />
                            {bank.bank_name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {selectedBank && (
                <div className="mt-3 flex items-center gap-2 text-sm">
                  <Badge variant="secondary" className="bg-blue-100 text-blue-700">
                    <Building2 className="h-3 w-3 mr-1" />
                    {selectedBank.bank_name}
                  </Badge>
                  <span className="text-muted-foreground">Bank-specific requirements will be applied.</span>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <div className="flex items-center justify-between border-b pb-4">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              {currentSubclass ? <Layers className="h-5 w-5 text-orange-500" /> : currentClass ? <Layers className="h-5 w-5 text-purple-500" /> : <FileText className="h-5 w-5 text-green-500" />}
              {currentSubclass ? currentSubclass.name : currentClass ? currentClass.name : currentSubdept.name}
              {String(activeDept) === "14" && selectedBank && (
                <>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  <span className="text-blue-600">{selectedBank.bank_name}</span>
                </>
              )}
            </h2>
            <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
              <Badge variant="outline" className="bg-slate-100">{currentDept.name}</Badge>
              <span>&rsaquo;</span><span>{currentSubdept.name}</span>
              {currentClass && <><span className="text-slate-300">&rsaquo;</span><span>{currentClass.name}</span></>}
              {currentSubclass && <><span className="text-slate-300">&rsaquo;</span><span>{currentSubclass.name}</span></>}
              {String(activeDept) === "14" && selectedBank && (
                <>
                  <span className="text-slate-300">&rsaquo;</span>
                  <Badge variant="outline" className="bg-blue-100 text-blue-700">
                    <Building2 className="h-3 w-3 mr-1" />
                    {selectedBank.bank_name}
                  </Badge>
                </>
              )}
            </div>
          </div>
          <Button
            onClick={() => { setAddContext(targetContext); setIsAddDialogOpen(true); }}
            disabled={String(activeDept) === "14" && !selectedBank}
          >
            <Plus className="h-4 w-4 mr-2" /> Add Items
          </Button>
        </div>

        {String(activeDept) === "1" ? (
          <div className="space-y-12">
            <section>
              <div className="flex items-center gap-2 mb-4 font-semibold">General Requirements</div>
              {reqs.filter(r => r.category === 'general').length > 0
                ? renderRequirements(reqs.filter(r => r.category === 'general'), targetContext)
                : <div className="text-center py-8 text-muted-foreground italic bg-slate-50/30 rounded-lg border">No requirements found in this section.</div>
              }
            </section>
            <section>
              <div className="flex items-center gap-2 mb-4 font-semibold">Processing Requirements</div>
              {reqs.filter(r => r.category === 'processing' || !r.category).length > 0
                ? renderRequirements(reqs.filter(r => r.category === 'processing' || !r.category), targetContext)
                : <div className="text-center py-8 text-muted-foreground italic bg-slate-50/30 rounded-lg border">No requirements found in this section.</div>
              }
            </section>
            <section>
              <div className="flex items-center gap-2 mb-4 font-semibold">Issuance Requirements</div>
              {reqs.filter(r => r.category === 'issuance').length > 0
                ? renderRequirements(reqs.filter(r => r.category === 'issuance'), targetContext)
                : <div className="text-center py-8 text-muted-foreground italic bg-slate-50/30 rounded-lg border">No requirements found in this section.</div>
              }
            </section>
            <section>
              <div className="flex items-center gap-2 mb-4 font-semibold">Reference Requirements</div>
              {reqs.filter(r => r.category === 'reference').length > 0
                ? renderRequirements(reqs.filter(r => r.category === 'reference'), targetContext)
                : <div className="text-center py-8 text-muted-foreground italic bg-slate-50/30 rounded-lg border">No requirements found in this section.</div>
              }
            </section>
          </div>
        ) : renderRequirements(reqs, targetContext)}

        <section className="pt-8 border-t">
          <div className="flex items-center gap-2 mb-4 font-semibold">Job Specific Questions</div>
          {renderQuestions(questions, targetContext)}
        </section>

        <section className="pt-8 border-t">
          <div className="flex items-center gap-2 mb-4 font-semibold">
            <Database className="h-4 w-4 text-blue-600" /> Web Data Configuration
          </div>
          {renderWebDataConfigurationSection(reqs)}
        </section>
      </div>
    )
  }

  // --- RENDER QUESTIONS HELPER ---
  const renderQuestions = (questions: JobQuestion[], context: EditingContext) => {
    const grouped = (questions || []).reduce((acc, q) => {
      const cat = q.category || "General / Uncategorized";
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(q);
      return acc;
    }, {} as Record<string, JobQuestion[]>);
    return (
      <div className="border rounded-lg overflow-hidden bg-white shadow-sm">
        <div className="overflow-auto max-h-[600px]">
          <Table>
            <TableHeader className="bg-slate-50 sticky top-0 z-10">
              <TableRow>
                <TableHead className="w-12 text-center border-r">#</TableHead>
                <TableHead className="min-w-[200px] border-r">Question Label</TableHead>
                <TableHead className="border-r">Input Type</TableHead>
                <TableHead className="border-r">Default Value</TableHead>
                <TableHead className="border-r">Required</TableHead>
                <TableHead className="border-r">Applies To</TableHead>
                <TableHead className="border-r">Linked Column</TableHead>
                <TableHead className="border-r">Configuration</TableHead>
                <TableHead className="w-16 text-center border-r">Client Req.</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Object.entries(grouped).map(([category, items]) => (
                <React.Fragment key={category}>
                  <TableRow className="bg-slate-50 border-y"><TableCell colSpan={9} className="py-2 px-4 font-bold text-xs uppercase text-slate-500">{category}</TableCell></TableRow>
                  {items.map((q, idx) => {
                    const linkedMasterField = q.linked_field_id
                      ? masterFields.find(mf => String(mf.id) === String(q.linked_field_id))
                      : null;
                    const absoluteIndex = questions.findIndex(item => item.id === q.id);
                    return (
                      <TableRow key={q.id} className="hover:bg-blue-50/30">
                        <TableCell className="text-center font-mono text-xs text-muted-foreground border-r">{idx + 1}</TableCell>
                        <TableCell className="border-r font-medium">{q.label}</TableCell>
                        <TableCell className="border-r"><Badge variant="outline" className="capitalize bg-slate-100">{q.type}</Badge></TableCell>
                        <TableCell className="border-r">
                          {q.default_value ? (
                            <span className="text-xs font-mono bg-slate-50 px-1.5 py-0.5 rounded border text-slate-600">
                              {q.default_value}
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-400 italic">None</span>
                          )}
                        </TableCell>
                        <TableCell className="border-r">
                          {q.required ? <Badge className="bg-red-50 text-red-600 hover:bg-red-100">Required</Badge> : <span className="text-xs text-slate-400">Optional</span>}
                        </TableCell>
                        <TableCell className="border-r">
                          <div className="flex flex-wrap gap-1">
                            {(q.entityTypes || []).length > 0 ? q.entityTypes?.map(t => {
                              const entityConfig = ENTITY_TYPES.find(et => et.value === t);
                              return (
                                <Badge key={t} variant="secondary" className="text-[10px] h-4 px-1">
                                  {entityConfig?.label || t}
                                </Badge>
                              );
                            }) : <span className="text-xs text-slate-400">All</span>}
                          </div>
                        </TableCell>
                        <TableCell className="border-r">
                          {q.linkedToColumn ? (
                            <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                              <Split className="h-3 w-3 mr-1" />
                              {q.linkedToColumn}
                            </Badge>
                          ) : (
                            <span className="text-xs text-slate-400">-</span>
                          )}
                        </TableCell>
                        <TableCell className="border-r text-xs">
                          {linkedMasterField ? (
                            <div className="flex items-center gap-1 text-blue-600">
                              <Database className="h-3 w-3" />
                              <span>Linked: {linkedMasterField.label}</span>
                            </div>
                          ) : (q.options && q.options.length > 0) ? (
                            <span className="text-slate-600" title={q.options.join(', ')}>
                              {q.options.length} Manual Options
                            </span>
                          ) : <span className="text-slate-400">-</span>}
                        </TableCell>
                        <TableCell className="border-r text-center">
                          <Checkbox
                            checked={!!q.is_client_requirement}
                            disabled={isSubmitting}
                            onCheckedChange={(checked) => handleToggleQuestionClientRequirement(q, context, !!checked)}
                            className="mx-auto"
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost" size="icon" className="h-8 w-8 text-slate-400"
                              disabled={absoluteIndex === 0 || isSubmitting}
                              onClick={() => handleMoveItem('question', absoluteIndex, 'up', context)}
                            >
                              <ArrowUp className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost" size="icon" className="h-8 w-8 text-slate-400"
                              disabled={absoluteIndex === questions.length - 1 || isSubmitting}
                              onClick={() => handleMoveItem('question', absoluteIndex, 'down', context)}
                            >
                              <ArrowDown className="h-3.5 w-3.5" />
                            </Button>
                            <Separator orientation="vertical" className="h-4 mx-1 my-auto" />
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-600" onClick={() => {
                              setEditingQuestion(q);
                              setEditingContext(context);
                              setIsEditQuestionDialogOpen(true);
                            }}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={() => {
                              setEditingContext(context);
                              setDeleteContext({ type: context.type, index: idx, requirementId: q.id, isQuestion: true });
                              setIsDeleteDialogOpen(true);
                            }}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </React.Fragment>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    )
  }

  // --- RENDER WEB DATA CONFIGURATION HELPER (Filtered for current job level requirements) ---
  const renderWebDataConfigurationSection = (currentReqs: RequirementTableEntry[]) => {
    // Only show automations that are linked in the current job level's requirements
    const activeAutomationIds = new Set(
      currentReqs.map(r => r.automationId || r.web_automation?.automationId).filter(Boolean)
    );
    const jobLevelAutomations = allAutomations.filter(a => activeAutomationIds.has(a.id));

    return (
      <div className="border rounded-lg overflow-hidden bg-white shadow-sm">
        <div className="overflow-auto max-h-[600px]">
          <Table>
            <TableHeader className="bg-slate-50 sticky top-0 z-10">
              <TableRow>
                <TableHead className="w-12 text-center border-r">#</TableHead>
                <TableHead className="min-w-[200px] border-r">Automation</TableHead>
                <TableHead className="border-r">Status</TableHead>
                <TableHead className="text-right">Fields</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobLevelAutomations.length > 0 ? (
                jobLevelAutomations.map((automation, idx) => {
                  const isExpanded = expandedAutomationConfig.has(automation.id);
                  const fields = automation.webdata || [];
                  return (
                    <React.Fragment key={automation.id}>
                      <TableRow className={cn("hover:bg-slate-50/50 cursor-pointer", isExpanded && "bg-slate-50 border-b-0")} onClick={() => toggleAutomationConfigRow(automation.id)}>
                        <TableCell className="text-center font-mono text-xs text-muted-foreground border-r">{idx + 1}</TableCell>
                        <TableCell className="border-r">
                          <div className="flex items-center gap-2 font-medium">
                            {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-slate-400" /> : <ChevronRight className="h-3.5 w-3.5 text-slate-400" />}
                            <Zap className="h-4 w-4 text-blue-600" />
                            {automation.name || 'Unnamed Automation'}
                          </div>
                        </TableCell>
                        <TableCell className="border-r">
                          {automation.is_active === false ? (
                            <Badge variant="outline" className="bg-slate-100 text-slate-500">Inactive</Badge>
                          ) : (
                            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Active</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant="secondary">{fields.length} Field{fields.length !== 1 ? 's' : ''}</Badge>
                        </TableCell>
                      </TableRow>
                      {isExpanded && fields.length > 0 && (
                        <TableRow className="bg-slate-50 hover:bg-slate-50">
                          <TableCell colSpan={4} className="p-0 border-b border-t shadow-inner">
                            <div className="p-4 pl-12">
                              <div className="bg-white border rounded-lg overflow-hidden">
                                <Table>
                                  <TableHeader>
                                    <TableRow className="bg-slate-100/50 hover:bg-slate-100/50">
                                      <TableHead className="h-8 text-xs font-bold">Variable Name</TableHead>
                                      <TableHead className="h-8 text-xs font-bold">Label</TableHead>
                                      <TableHead className="h-8 text-xs font-bold">Type</TableHead>
                                      <TableHead className="h-8 text-xs font-bold">Entity</TableHead>
                                      <TableHead className="h-8 text-xs font-bold">Mapped Sources</TableHead>
                                      <TableHead className="h-8 text-xs font-bold text-center">Client Requirement</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {fields.map((field: any, fieldIndex: number) => {
                                      const nestedFields = field.arrayFields || field.subFields || field.items || [];
                                      const hasNested = field.fieldType === 'array' && nestedFields.length > 0;
                                      return (
                                        <React.Fragment key={fieldIndex}>
                                          <TableRow className="hover:bg-slate-50/50">
                                            <TableCell className="py-2 text-xs font-mono text-blue-600">{field.variableName}</TableCell>
                                            <TableCell className="py-2 text-xs font-medium">{field.efnsDisplayName || field.name}</TableCell>
                                            <TableCell className="py-2 text-xs"><Badge variant="secondary" className="text-[10px] h-5">{field.fieldType}</Badge></TableCell>
                                            <TableCell className="py-2 text-xs capitalize text-slate-500">{Array.isArray(field.entityTypes) ? field.entityTypes.join(', ') : (field.entityType || '-')}</TableCell>
                                            <TableCell className="py-2 text-xs text-slate-400">
                                              {field.fieldType === 'document'
                                                ? `Document: ${kycDocuments.find(d => d.id === field.documentId)?.display_name || 'Unknown'}`
                                                : field.linkedMasterFields?.length
                                                  ? `${field.linkedMasterFields.length} linked field(s)`
                                                  : "Manual / None"}
                                            </TableCell>
                                            <TableCell className="py-2 text-center">
                                              <Checkbox
                                                checked={!!field.is_client_requirement}
                                                onCheckedChange={(checked) => handleToggleWebdataFieldClientRequirement(automation.id, fieldIndex, !!checked)}
                                                className="mx-auto"
                                              />
                                            </TableCell>
                                          </TableRow>
                                          {hasNested && nestedFields.map((subField: any, subIdx: number) => (
                                            <TableRow key={`sub-${fieldIndex}-${subIdx}`} className="hover:bg-slate-50/50 bg-slate-50/80">
                                              <TableCell className="py-2 text-xs font-mono text-blue-600">
                                                <div className="flex items-center gap-2 pl-4">
                                                  <span className="text-slate-300">↳</span>
                                                  {subField.variableName}
                                                </div>
                                              </TableCell>
                                              <TableCell className="py-2 text-xs font-medium">{subField.efnsDisplayName || subField.name}</TableCell>
                                              <TableCell className="py-2 text-xs"><Badge variant="secondary" className="text-[10px] h-5">{subField.fieldType}</Badge></TableCell>
                                              <TableCell className="py-2 text-xs capitalize text-slate-500">{Array.isArray(subField.entityTypes) ? subField.entityTypes.join(', ') : (subField.entityType || '-')}</TableCell>
                                              <TableCell className="py-2 text-xs text-slate-400">
                                                {subField.fieldType === 'document'
                                                  ? `Document: ${kycDocuments.find(d => d.id === subField.documentId)?.display_name || 'Unknown'}`
                                                  : subField.linkedMasterFields?.length
                                                    ? `${subField.linkedMasterFields.length} linked field(s)`
                                                    : "Manual / None"}
                                              </TableCell>
                                              <TableCell className="py-2 text-center">
                                                <span className="text-xs text-slate-400">-</span>
                                              </TableCell>
                                            </TableRow>
                                          ))}
                                        </React.Fragment>
                                      )
                                    })}
                                  </TableBody>
                                </Table>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  )
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground italic bg-slate-50/30">
                    No automation types linked to the current job level.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    )
  }

  const renderRequirements = (requirements: RequirementTableEntry[], context: EditingContext) => {
    return (
      <div className="border rounded-lg overflow-hidden bg-white shadow-sm">
        <div className="overflow-auto max-h-[600px]">
          <Table>
            <TableHeader className="bg-slate-50 sticky top-0 z-10">
              <TableRow>
                <TableHead className="w-12 text-center border-r">#</TableHead>
                <TableHead className="min-w-[200px] border-r">Requirement Name</TableHead>
                <TableHead className="border-r">Type</TableHead>
                <TableHead className="border-r">Applies To</TableHead>
                <TableHead className="border-r">Documents</TableHead>
                <TableHead className="border-r">Function</TableHead>
                <TableHead className="border-r">Source Config</TableHead>
                <TableHead className="border-r">Web Data</TableHead>
                <TableHead className="border-r">Automation</TableHead>
                <TableHead className="w-16 text-center border-r">Apply</TableHead>
                <TableHead className="w-16 text-center border-r">Client Req.</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requirements.length > 0 ? (
                requirements.map((req, idx) => {
                  const hasWebData = req.webdata && req.webdata.length > 0;
                  const isExpanded = expandedWebDataRows.has(req.id || `temp-${idx}`);
                  const absoluteIndex = reqs.findIndex(item => item.id === req.id);

                  return (
                    <React.Fragment key={req.id || idx}>
                      <TableRow className={cn("hover:bg-slate-50/50", isExpanded && "bg-slate-50 border-b-0")}>
                        <TableCell className="text-center font-mono text-xs text-muted-foreground border-r">{idx + 1}</TableCell>
                        <TableCell className="border-r">
                          <div className="font-medium">{req.name}</div>
                          {req.description && <div className="text-xs text-muted-foreground line-clamp-1">{req.description}</div>}
                        </TableCell>
                        <TableCell className="border-r">{getTypeDisplay(req)}</TableCell>
                        <TableCell className="border-r">{getContextDisplay(req)}</TableCell>
                        <TableCell className="border-r">{getDocumentsDisplay(req)}</TableCell>
                        <TableCell className="border-r">{getFunctionDisplay(req)}</TableCell>
                        <TableCell className="border-r">
                          {req.category === 'reference' ? (
                            <div className="space-y-1">
                              <div className="text-[10px] text-slate-500">Source: <span className="font-medium text-slate-700">{req.sourceTable || '-'}</span></div>
                              <div className="text-[10px] text-slate-500">Link: <span className="font-medium text-slate-700">{req.linkingVariable || '-'}</span></div>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400">-</span>
                          )}
                        </TableCell>
                        <TableCell className="border-r">
                          {(() => {
                            const hasWebData = req.webdata && req.webdata.length > 0;
                            return hasWebData ? (
                              <Badge
                                variant={isExpanded ? "default" : "outline"}
                                className={cn("cursor-pointer hover:bg-blue-100 hover:text-blue-700 transition-colors", isExpanded && "bg-blue-600 hover:bg-blue-700")}
                                onClick={() => toggleWebDataRow(req.id || `temp-${idx}`)}
                              >
                                {isExpanded ? <ChevronDown className="h-3 w-3 mr-1" /> : <Code className="h-3 w-3 mr-1" />}
                                {req.webdata.length} Fields
                              </Badge>
                            ) : (
                              <span className="text-xs text-slate-400">-</span>
                            )
                          })()}
                        </TableCell>
                        <TableCell className="border-r">{getAutomationDisplay(req)}</TableCell>
                        <TableCell className="border-r text-center">
                          {req.inherit_from_parent ? (
                            <Checkbox
                              checked={!disabledInheritedReqs.has(req.id || '')}
                              onCheckedChange={(checked) => {
                                setDisabledInheritedReqs(prev => {
                                  const next = new Set(prev);
                                  if (checked) {
                                    next.delete(req.id || '');
                                  } else {
                                    next.add(req.id || '');
                                  }
                                  return next;
                                });
                              }}
                              className="mx-auto"
                            />
                          ) : (
                            <span className="text-xs text-slate-400">-</span>
                          )}
                        </TableCell>
                        <TableCell className="border-r text-center">
                          <Checkbox
                            checked={!!req.is_client_requirement}
                            disabled={isSubmitting}
                            onCheckedChange={(checked) => handleToggleClientRequirement(req, context, !!checked)}
                            className="mx-auto"
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost" size="icon" className="h-8 w-8 text-slate-400"
                              disabled={absoluteIndex === 0 || isSubmitting}
                              onClick={() => handleMoveItem('requirement', absoluteIndex, 'up', context)}
                            >
                              <ArrowUp className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost" size="icon" className="h-8 w-8 text-slate-400"
                              disabled={absoluteIndex === reqs.length - 1 || isSubmitting}
                              onClick={() => handleMoveItem('requirement', absoluteIndex, 'down', context)}
                            >
                              <ArrowDown className="h-3.5 w-3.5" />
                            </Button>

                            <Separator orientation="vertical" className="h-4 mx-1 my-auto" />
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-600" onClick={() => {
                              setEditingRequirement(req);
                              setEditingContext({
                                ...context,
                                jobLevel: context.jobLevel || {
                                  department_id: context.departmentId,
                                  subdepartment_id: context.subdepartmentId,
                                  class_id: context.classId || null,
                                  subclass_id: context.subclassId || null
                                }
                              });
                              setIsEditDialogOpen(true);
                            }}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={() => {
                              setEditingContext(context);
                              setDeleteContext({ type: context.type, index: idx, requirementId: req.id, isQuestion: false });
                              setIsDeleteDialogOpen(true);
                            }}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>

                      {/* EXPANDED WEB DATA ROW */}
                      {isExpanded && hasWebData && (
                        <TableRow className="bg-slate-50 hover:bg-slate-50">
                          <TableCell colSpan={12} className="p-0 border-b border-t shadow-inner">
                            <div className="p-4 pl-12">
                              <div className="flex items-center gap-2 mb-3 text-blue-600">
                                <Database className="h-4 w-4" />
                                <span className="text-sm font-bold uppercase tracking-wider">Web Data Configuration</span>
                              </div>
                              <div className="bg-white border rounded-lg overflow-hidden">
                                <Table>
                                  <TableHeader>
                                    <TableRow className="bg-slate-100/50 hover:bg-slate-100/50">
                                      <TableHead className="h-8 text-xs font-bold">Variable Name</TableHead>
                                      <TableHead className="h-8 text-xs font-bold">Label (Display Name)</TableHead>
                                      <TableHead className="h-8 text-xs font-bold">Type</TableHead>
                                      <TableHead className="h-8 text-xs font-bold">Entity</TableHead>
                                      <TableHead className="h-8 text-xs font-bold">Mapped Sources</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {req.webdata.map((field, i) => {
                                      const nestedFields = field.arrayFields || field.subFields || field.items || [];
                                      const hasNested = field.fieldType === 'array' && nestedFields.length > 0;
                                      return (
                                        <React.Fragment key={i}>
                                          <TableRow className="hover:bg-slate-50/50">
                                            <TableCell className="py-2 text-xs font-mono text-blue-600">{field.variableName}</TableCell>
                                            <TableCell className="py-2 text-xs font-medium">{field.efnsDisplayName || field.name}</TableCell>
                                            <TableCell className="py-2 text-xs"><Badge variant="secondary" className="text-[10px] h-5">{field.fieldType}</Badge></TableCell>
                                            <TableCell className="py-2 text-xs capitalize text-slate-500">{field.entityType}</TableCell>
                                            <TableCell className="py-2 text-xs text-slate-400">
                                              {field.fieldType === 'document'
                                                ? `Document: ${kycDocuments.find(d => d.id === field.documentId)?.display_name || 'Unknown'}`
                                                : field.linkedMasterFields?.length
                                                  ? field.linkedMasterFields.map(m => m.label).join(", ")
                                                  : "Manual / None"}
                                            </TableCell>
                                          </TableRow>
                                          {hasNested && nestedFields.map((subField: any, subIdx: number) => (
                                            <TableRow key={`sub-${i}-${subIdx}`} className="hover:bg-slate-50/50 bg-slate-50/80">
                                              <TableCell className="py-2 text-xs font-mono text-blue-600">
                                                <div className="flex items-center gap-2 pl-4">
                                                  <span className="text-slate-300">↳</span>
                                                  {subField.variableName}
                                                </div>
                                              </TableCell>
                                              <TableCell className="py-2 text-xs font-medium">{subField.efnsDisplayName || subField.name}</TableCell>
                                              <TableCell className="py-2 text-xs"><Badge variant="secondary" className="text-[10px] h-5">{subField.fieldType}</Badge></TableCell>
                                              <TableCell className="py-2 text-xs capitalize text-slate-500">{subField.entityType}</TableCell>
                                              <TableCell className="py-2 text-xs text-slate-400">
                                                {subField.fieldType === 'document'
                                                  ? `Document: ${kycDocuments.find(d => d.id === subField.documentId)?.display_name || 'Unknown'}`
                                                  : subField.linkedMasterFields?.length
                                                    ? subField.linkedMasterFields.map((m: any) => m.label).join(", ")
                                                    : "Manual / None"}
                                              </TableCell>
                                            </TableRow>
                                          ))}
                                        </React.Fragment>
                                      )
                                    })}
                                  </TableBody>
                                </Table>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  )
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={12} className="text-center py-8 text-muted-foreground italic bg-slate-50/30">
                    No requirements found in this section.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    )
  }

  const getTypeDisplay = (req: RequirementTableEntry) => {
    const baseType = req.type || 'standard'
    if (baseType === 'company') return <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">Company</Badge>
    if (baseType === 'multi-document') return <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">Multi ({req.requiredDocumentCount})</Badge>
    return <Badge variant="outline" className="capitalize">{baseType}</Badge>
  }

  const getContextDisplay = (req: RequirementTableEntry) => {
    const types = req.entityTypes || []
    if (types.length === 0) return <span className="text-xs text-gray-400">-</span>
    return (
      <div className="flex flex-wrap gap-1">
        {types.map(t => {
          const entityConfig = ENTITY_TYPES.find(et => et.value === t);
          return (
            <Badge key={t} variant="secondary" className="text-[10px] h-4 px-1">
              {entityConfig?.label || t}
            </Badge>
          );
        })}
      </div>
    )
  }

  const getAutomationDisplay = (req: RequirementTableEntry) => {
    const indicators = []
    if (req.web_automation?.automationId) {
      indicators.push(
        <div key="web-automation" className="flex items-center gap-1 text-blue-600">
          <Zap className="h-3.5 w-3.5 fill-current" />
          <span className="text-[11px] font-medium">{req.web_automation.automationName}</span>
        </div>
      )
    }
    if (req.hasTemplate) {
      indicators.push(
        <div key="template" className="flex items-center gap-1 text-orange-600">
          <FileType className="h-3.5 w-3.5 fill-current" />
          <span className="text-[11px] font-medium">Template</span>
        </div>
      )
    }
    if (indicators.length === 0) return <span className="text-gray-400 text-[11px]">None</span>
    return <div className="flex flex-col gap-1">{indicators}</div>
  }

  const getFunctionDisplay = (req: RequirementTableEntry) => {
    const computedFunction = req.computed_function || req.computedFunction || 'none'
    const functionItem = COMPUTED_FUNCTIONS.find(fn => fn.value === computedFunction)

    if (!functionItem || computedFunction === 'none') {
      return <span className="text-gray-400 text-[11px]">None</span>
    }

    return (
      <div className="flex items-center gap-1">
        <Badge variant="outline" className="text-[10px] px-1.5 py-0.5">
          {functionItem.label}
        </Badge>
        {req.execution_mode && (
          <span className="text-[9px] text-slate-500">
            ({req.execution_mode === 'latest' ? 'Latest' : 'All'})
          </span>
        )}
      </div>
    )
  }

  const getDocumentsDisplay = (req: RequirementTableEntry) => {
    const documentIds = req.document_ids || []
    const documentCount = documentIds.length
    const documentNames = getDocumentNames(documentIds)
    if (documentCount === 0) return <span className="text-gray-400 text-[11px]">No documents</span>
    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className="h-auto p-1 text-xs">
            <Badge variant="secondary" className="cursor-pointer hover:bg-slate-200">
              {documentCount} document{documentCount !== 1 ? 's' : ''}
            </Badge>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-0" align="start">
          <Command>
            <CommandList>
              <CommandGroup heading="Linked Documents">
                {documentNames.map((name, index) => (
                  <CommandItem key={index} className="flex items-center gap-2 py-2">
                    <FileText className="h-4 w-4 text-blue-600" />
                    <span className="text-sm">{name}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    )
  }

  const handleAddRequirements = async (payload: any) => {
    try {
      setIsSubmitting(true);
      const { data: existing, error: fetchError } = await supabase
        .from('tm_class_requirements')
        .select('*')
        .eq('job_level', JSON.stringify(payload.job_level))
        .maybeSingle();
      if (fetchError) throw fetchError;

      if (existing) {
        const updateData: any = { updated_at: payload.updated_at };
        if (payload.requirements) updateData.requirements = payload.requirements;
        if (payload.job_specific_questions) updateData.job_specific_questions = payload.job_specific_questions;

        const { error: updateError } = await supabase
          .from('tm_class_requirements')
          .update(updateData)
          .eq('id', existing.id);
        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase
          .from('tm_class_requirements')
          .insert({ ...payload, created_at: new Date().toISOString() });
        if (insertError) throw insertError;
      }
      await refreshDepartments();
      toast({ title: "Success", description: "Requirements updated successfully" });
    } catch (error) {
      console.error(error);
      toast({ title: "Error", description: "Failed to save data", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveRequirement = async (updatedRequirement: any, contextOverride?: EditingContext) => {
    const context = contextOverride || editingContext;
    if (!context) return;
    try {
      setIsSubmitting(true);
      const { data: existing, error: fetchError } = await supabase
        .from('tm_class_requirements')
        .select('*')
        .eq('job_level', JSON.stringify({
          department_id: Number(context.departmentId),
          subdepartment_id: Number(context.subdepartmentId),
          class_id: context.classId ? Number(context.classId) : null,
          subclass_id: context.subclassId ? Number(context.subclassId) : null,
          level: context.type === 'subdepartment' ? 2 : context.type === 'class' ? 3 : 4
        }))
        .maybeSingle();
      if (fetchError) throw fetchError;
      if (!existing) throw new Error('No existing record found');
      const updatedRequirements = existing.requirements.map((req: any) =>
        req.id === updatedRequirement.id ? updatedRequirement : req
      );
      const filteredRequirements = updatedRequirements.filter((req: any) => {
        if (req.inherit_from_parent && disabledInheritedReqs.has(req.id || '')) {
          return false;
        }
        return true;
      });
      const { error: updateError } = await supabase
        .from('tm_class_requirements')
        .update({ requirements: filteredRequirements, updated_at: new Date().toISOString() })
        .eq('id', existing.id);
      if (updateError) throw updateError;
      await refreshDepartments();
      setIsEditDialogOpen(false);
      toast({ title: "Success", description: "Requirement updated successfully" });
    } catch (error) {
      console.error(error);
      toast({ title: "Error", description: "Failed to update requirement", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleClientRequirement = async (req: RequirementTableEntry, context: EditingContext, checked: boolean) => {
    await handleSaveRequirement({ ...req, is_client_requirement: checked }, context);
  };

  const handleToggleQuestionClientRequirement = async (question: JobQuestion, context: EditingContext, checked: boolean) => {
    try {
      setIsSubmitting(true);
      const jobLevel = {
        department_id: Number(context.departmentId),
        subdepartment_id: Number(context.subdepartmentId),
        class_id: context.classId ? Number(context.classId) : null,
        subclass_id: context.subclassId ? Number(context.subclassId) : null,
        level: context.type === 'subdepartment' ? 2 : context.type === 'class' ? 3 : 4
      };
      const { data: existing } = await supabase
        .from('tm_class_requirements')
        .select('*')
        .eq('job_level', JSON.stringify(jobLevel))
        .maybeSingle();

      if (!existing) return;

      const updatedQuestions = (existing.job_specific_questions || []).map((q: any) =>
        q.id === question.id ? { ...q, is_client_requirement: checked } : q
      );

      const { error } = await supabase
        .from('tm_class_requirements')
        .update({ job_specific_questions: updatedQuestions, updated_at: new Date().toISOString() })
        .eq('id', existing.id);

      if (error) throw error;
      await refreshDepartments();
      toast({ title: "Success", description: "Question requirement status updated" });
    } catch (error) {
      console.error(error);
      toast({ title: "Error", description: "Failed to update question", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleAutomationConfigRow = (automationId: string) => {
    setExpandedAutomationConfig(prev => {
      const next = new Set(prev);
      if (next.has(automationId)) next.delete(automationId); else next.add(automationId);
      return next;
    });
  };

  const handleToggleWebdataFieldClientRequirement = async (automationId: string, fieldIndex: number, checked: boolean) => {
    const automation = allAutomations.find(a => a.id === automationId);
    if (!automation) return;
    const updatedWebdata = automation.webdata.map((f, i) => i === fieldIndex ? { ...f, is_client_requirement: checked } : f);
    try {
      const { error } = await supabase
        .from('tm_automations')
        .update({ webdata: updatedWebdata, updated_at: new Date().toISOString() })
        .eq('id', automationId);
      if (error) throw error;
      setAllAutomations(prev => prev.map(a => a.id === automationId ? { ...a, webdata: updatedWebdata } : a));
      toast({ title: "Success", description: "Field updated" });
    } catch (error) {
      console.error(error);
      toast({ title: "Error", description: "Failed to update field", variant: "destructive" });
    }
  };

  const handleSaveQuestion = async (updatedQuestion: JobQuestion) => {
    if (!editingContext) return;
    try {
      setIsSubmitting(true);
      // Construct Job Level
      const jobLevel = {
        department_id: Number(editingContext.departmentId),
        subdepartment_id: Number(editingContext.subdepartmentId),
        class_id: editingContext.classId ? Number(editingContext.classId) : null,
        subclass_id: editingContext.subclassId ? Number(editingContext.subclassId) : null,
        level: editingContext.type === 'subdepartment' ? 2 : editingContext.type === 'class' ? 3 : 4
      }

      // Fetch Existing
      const { data: existing, error: fetchError } = await supabase
        .from('tm_class_requirements')
        .select('*')
        .eq('job_level', JSON.stringify(jobLevel))
        .maybeSingle();

      if (fetchError) throw fetchError;
      if (!existing) throw new Error('No existing record found');

      // Update Question in Array
      const existingQuestions = existing.job_specific_questions || [];
      const updatedQuestions = existingQuestions.map((q: any) =>
        q.id === updatedQuestion.id ? updatedQuestion : q
      );

      // Save
      const { error: updateError } = await supabase
        .from('tm_class_requirements')
        .update({
          job_specific_questions: updatedQuestions,
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id);

      if (updateError) throw updateError;

      await refreshDepartments();
      setIsEditQuestionDialogOpen(false);
      toast({ title: "Success", description: "Question updated successfully" });

    } catch (error) {
      console.error(error);
      toast({ title: "Error", description: "Failed to update question", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  }

  const handleDeleteRequirement = async (requirementId: string) => {
    if (!editingContext) return;
    try {
      setIsSubmitting(true);
      const { data: existing, error: fetchError } = await supabase
        .from('tm_class_requirements')
        .select('*')
        .eq('job_level', JSON.stringify({
          department_id: Number(editingContext.departmentId),
          subdepartment_id: Number(editingContext.subdepartmentId),
          class_id: editingContext.classId ? Number(editingContext.classId) : null,
          subclass_id: editingContext.subclassId ? Number(editingContext.subclassId) : null,
          level: editingContext.type === 'subdepartment' ? 2 : editingContext.type === 'class' ? 3 : 4
        }))
        .maybeSingle();
      if (fetchError) throw fetchError;
      if (!existing) throw new Error('No existing record');

      let updatePayload: any = { updated_at: new Date().toISOString() };

      if (deleteContext?.isQuestion) {
        const updatedQuestions = (existing.job_specific_questions || []).filter((q: any) => q.id !== requirementId);
        const reorderedQuestions = updatedQuestions.map((q: any, index: number) => ({ ...q, order: index }));
        updatePayload.job_specific_questions = reorderedQuestions;
      } else {
        const updatedRequirements = (existing.requirements || []).filter((req: any) => req.id !== requirementId);
        const reorderedRequirements = updatedRequirements.map((req: any, index: number) => ({ ...req, order: index }));
        updatePayload.requirements = reorderedRequirements;
      }

      const { error: updateError } = await supabase
        .from('tm_class_requirements')
        .update(updatePayload)
        .eq('id', existing.id);

      if (updateError) throw updateError;
      await refreshDepartments();
      setIsDeleteDialogOpen(false);
      setDeleteContext(null);
      toast({ title: "Success", description: `${deleteContext?.isQuestion ? 'Question' : 'Requirement'} deleted successfully` });
    } catch (error) {
      console.error(error);
      toast({ title: "Error", description: "Failed to delete item", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full overflow-auto bg-background">
      <ResizablePanelGroup direction="horizontal">
        {/* SIDEBAR PANEL */}
        <ResizablePanel
          ref={sidebarPanelRef}
          defaultSize={20}
          minSize={15}
          maxSize={30}
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
            activeDept={activeDept}
            activeSubdept={activeSubdept}
            activeClass={activeClass}
            activeSubclass={activeSubclass}
            onDeptClick={handleDeptClick}
            onSubdeptClick={handleSubdeptClick}
            onClassClick={handleClassClick}
            onSubclassClick={handleSubclassClick}
            expandedItems={expandedItems}
            onToggleExpand={(key) => setExpandedItems(prev => ({ ...prev, [key]: !prev[key] }))}
            isCollapsed={isSidebarCollapsed}
            onCollapseToggle={handleSidebarToggle}
          />
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* MAIN CONTENT PANEL */}
        <ResizablePanel defaultSize={80}>
          <main className="h-full flex flex-col overflow-auto">
            <div className="h-full overflow-auto p-4 space-y-4">
              <header className="flex items-center justify-between"><div><h2 className="text-3xl font-bold tracking-tight">Requirement Logic Manager</h2></div></header>
              {!activeDept ? <Card className="p-20 text-center"><FileText className="mx-auto h-12 w-12 text-slate-300 mb-4" /><p>Select a department to manage logic.</p></Card> : renderMainContent()}

              <AddRequirementsDialog isOpen={isAddDialogOpen} onOpenChange={setIsAddDialogOpen} onSubmit={handleAddRequirements} isSubmitting={isSubmitting} context={addContext} />
              <EditRequirementDialog isOpen={isEditDialogOpen} onOpenChange={setIsEditDialogOpen} requirement={editingRequirement} onSave={handleSaveRequirement} isSubmitting={isSubmitting} context={editingContext} />

              <EditJobQuestionDialog
                isOpen={isEditQuestionDialogOpen}
                onOpenChange={setIsEditQuestionDialogOpen}
                question={editingQuestion}
                allQuestions={activeSelection.questions || []}
                onSave={handleSaveQuestion}
                isSubmitting={isSubmitting}
                masterFields={masterFields}
              />

              <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <DialogContent><DialogHeader><DialogTitle>Confirm Delete</DialogTitle></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>Cancel</Button><Button variant="destructive" onClick={() => deleteContext?.requirementId && handleDeleteRequirement(deleteContext.requirementId)} disabled={isSubmitting}>Delete</Button></DialogFooter></DialogContent>
              </Dialog>
            </div>
          </main>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  )
}