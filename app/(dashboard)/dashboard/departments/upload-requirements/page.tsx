// @ts-nocheck
'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useEffect, useState, useMemo } from "react"
import { cn } from "@/lib/utils"
import { Pencil, Trash2, ArrowUp, ArrowDown, Plus, X, Check, PanelLeft, LayoutGrid, ChevronRight, ChevronDown, FileText, Layers, AlertTriangle, Eye, EyeOff, Zap } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Checkbox } from "@/components/ui/checkbox"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command"
import supabase from "@/lib/supabase/client"
import { toast } from "@/hooks/use-toast"
import { DepartmentSidebar } from "@/app/(dashboard)/dashboard/departments/main-shared-components/department-sidebar"
import { EditRequirementDialog } from "./components/EditRequirementDialog"
import { AddRequirementsDialog } from "./components/AddRequirementsDialog"

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
}

interface Class {
  id: string | number
  name: string
  description?: string
  requirements?: ApiRequirement[]
  subClasses?: Subclass[]
}

interface Subclass {
  id: string | number
  name: string
  description?: string
  requirements?: ApiRequirement[]
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
}

interface ApiRequirement {
  id?: string
  name: string
  description?: string
  type: 'standard' | 'conditional' | 'optional' | 'company' | 'multi-document'
  order: number
  isVisible: boolean
  isRequired: boolean
  kyc_document_ids?: string[]  // New JSON array field
  hasWebForm?: boolean
  webFormName?: string
  automationId?: string
  applicantTypes?: string[]    // New JSON array field
  requiredDocumentCount?: number
  billingEntity?: string
  instructions?: string
  requirement_context?: any
  web_automation?: any
  category?: 'general' | 'processing' | 'issuance'
  // Old fields removed: kycDocumentId, applicantType
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
  const [showDefaultDisplayOnly, setShowDefaultDisplayOnly] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [editingRequirement, setEditingRequirement] = useState<ApiRequirement | null>(null)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [addContext, setAddContext] = useState<EditingContext | null>(null)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [deleteContext, setDeleteContext] = useState<{ type: string, index: number, requirementId?: string } | null>(null)
  const [editingContext, setEditingContext] = useState<EditingContext | null>(null)
  const [kycDocuments, setKycDocuments] = useState<any[]>([])

  // Fetch KYC documents for display
  useEffect(() => {
    const fetchKycDocuments = async () => {
      try {
        const { data } = await supabase.from('acc_portal_kyc').select('id, name, display_name').order('name')
        setKycDocuments(data || [])
      } catch (error) {
        console.error('Error fetching KYC documents:', error)
      }
    }
    fetchKycDocuments()
  }, [])

  // Helper function to get document names
  const getDocumentNames = (documentIds: string[] | undefined) => {
    if (!documentIds || !Array.isArray(documentIds)) return []
    return documentIds.map(id => {
      const doc = kycDocuments.find(d => d.id === id)
      return doc?.display_name || doc?.name || `Document ${id}`
    })
  }

  // Initialization logic to select first items if nothing is active
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

  const mapRequirementsData = (record: any) => {
    if (!record || !record.requirements) return []
    
    return record.requirements.map((r: any) => {
      const contextItem = record.requirement_context?.find((ctx: any) => String(ctx.requirementId) === String(r.id))
      const automationItem = record.web_automation?.find((auto: any) => String(auto.requirementId) === String(r.id))
      const ctx = contextItem?.context || {}
      
      return {
        ...r,
        // Prioritize new JSON columns, fall back to old fields for backward compatibility
        applicantTypes: r.applicantTypes || ctx.applicantTypes || (r.applicantType ? [r.applicantType] : []),
        kyc_document_ids: r.kyc_document_ids || (r.kycDocumentId ? [r.kycDocumentId] : []),
        requiredDocumentCount: ctx.requiredDocumentCount || r.requiredDocumentCount || 1,
        billingEntity: ctx.billingEntity || r.billingEntity || 'applicant',
        instructions: ctx.instructions || r.instructions || '',
        requirement_context: ctx,
        web_automation: automationItem?.automation || null
      }
    })
  }

  const refreshDepartments = async () => {
    try {
      const { data: departmentsData, error: deptError } = await supabase
        .from('tm_departments')
        .select('*, tm_subdepartments(*)')
        .order('order', { ascending: true })

      if (deptError) throw deptError

      const { data: allReqRecords, error: reqError } = await supabase
        .from('tm_class_requirements')
        .select('*')

      if (reqError) throw reqError

      const processedDepartments = (departmentsData || []).map(dept => {
        const subdepartments = (dept.tm_subdepartments || []).map(subdept => {
          
          const findRecord = (cId: string | null, scId: string | null) => {
            return allReqRecords?.find(r => {
              const job = r.job_level || {}
              return String(job.department_id) === String(dept.id) &&
                     String(job.subdepartment_id) === String(subdept.id) &&
                     String(job.class_id || 'null') === String(cId || 'null') &&
                     String(job.subclass_id || 'null') === String(scId || 'null')
            })
          }

          // Build the class/subclass tree while preserving existing data fields
          const classes = (subdept.classes || []).map(cls => {
            const classRec = findRecord(String(cls.id), null)
            const subClasses = (cls.subClasses || []).map(subCls => {
              const subClsRec = findRecord(String(cls.id), String(subCls.id))
              return { 
                ...subCls, 
                requirements: mapRequirementsData(subClsRec) 
              }
            })
            return { 
              ...cls, 
              requirements: mapRequirementsData(classRec), 
              subClasses 
            }
          })

          const subDeptRec = findRecord(null, null)

          return {
            ...subdept,
            classes,
            upload_requirements: mapRequirementsData(subDeptRec)
          }
        })
        return { 
          ...dept, 
          subdepartments, // Alias for some sidebar versions
          tm_subdepartments: subdepartments 
        }
      })

      setDepartments(processedDepartments)
    } catch (error) {
      console.error('Error refreshing data tree:', error)
      setDepartments([])
    }
  }

  useEffect(() => {
    refreshDepartments()
  }, [])

  const handleDeptClick = (deptId: string) => {
    setActiveDept(String(deptId))
  }

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
    const currentDept = departments.find(d => String(d.id) === String(activeDept))
    
    if (!currentDept) return <div className="p-10 text-center text-gray-400">Select a department from the sidebar to begin.</div>

    const currentSubdeptId = activeSubdept[String(currentDept.id)]
    const currentSubdept = currentDept.tm_subdepartments?.find(s => String(s.id) === String(currentSubdeptId))

    if (!currentSubdept) {
      return (
        <div className="p-8">
          <h2 className="text-2xl font-bold mb-2">{currentDept.name}</h2>
          <p className="text-muted-foreground italic">Select a subdepartment from the sidebar to view requirements.</p>
        </div>
      )
    }

    const activeClassKey = `${String(currentDept.id)}-${String(currentSubdept.id)}`
    const currentClassId = activeClass[activeClassKey]
    const currentClass = currentSubdept.classes?.find(c => String(c.id) === String(currentClassId))

    const activeSubclassKey = `${activeClassKey}-${String(currentClassId)}`
    const currentSubclassId = activeSubclass[activeSubclassKey]
    const currentSubclass = currentClass?.subClasses?.find(sc => String(sc.id) === String(currentSubclassId))

    const targetContext: EditingContext = currentSubclass 
      ? { type: 'subclass', departmentId: currentDept.id, subdepartmentId: currentSubdept.id, classId: currentClass.id, subclassId: currentSubclass.id, subdepartmentName: currentSubdept.name, className: currentClass.name, subclassName: currentSubclass.name }
      : currentClass
      ? { type: 'class', departmentId: currentDept.id, subdepartmentId: currentSubdept.id, classId: currentClass.id, subdepartmentName: currentSubdept.name, className: currentClass.name }
      : { type: 'subdepartment', departmentId: currentDept.id, subdepartmentId: currentSubdept.id, subdepartmentName: currentSubdept.name }
    
    const reqsToDisplay = (currentSubclass ? currentSubclass.requirements : currentClass ? currentClass.requirements : currentSubdept.upload_requirements) || []

    // SPECIAL LOGIC FOR DEPARTMENT ID 1
    const isDept1 = String(activeDept) === "1"

    return (
      <div className="space-y-8">
        <div className="flex items-center justify-between border-b pb-4">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
               {currentSubclass ? <Layers className="h-5 w-5 text-orange-500" /> : currentClass ? <Layers className="h-5 w-5 text-purple-500" /> : <FileText className="h-5 w-5 text-green-500" />}
               {currentSubclass ? currentSubclass.name : currentClass ? currentClass.name : currentSubdept.name}
            </h2>
            <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
               <Badge variant="outline" className="bg-slate-100">{currentDept.name}</Badge>
               <span>&rsaquo;</span>
               <span>{currentSubdept.name}</span>
               {currentClass && <><span className="text-slate-300">&rsaquo;</span><span>{currentClass.name}</span></>}
               {currentSubclass && <><span className="text-slate-300">&rsaquo;</span><span>{currentSubclass.name}</span></>}
            </div>
          </div>
          <Button onClick={() => { setAddContext(targetContext); setIsAddDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" /> Add Requirements
          </Button>
        </div>

        {isDept1 ? (
          <div className="space-y-12">
            {/* SECTION 1: GENERAL REQUIREMENTS */}
            <section>
              <div className="flex items-center gap-2 mb-4">
                <div className="h-8 w-1 bg-blue-600 rounded-full" />
                <h3 className="text-lg font-semibold">General Requirements</h3>
              </div>
              {renderRequirements(reqsToDisplay.filter(r => r.category === 'general'), targetContext)}
            </section>

            {/* SECTION 2: UPLOAD PROCESSING REQUIREMENTS */}
            <section>
              <div className="flex items-center gap-2 mb-4">
                <div className="h-8 w-1 bg-amber-500 rounded-full" />
                <h3 className="text-lg font-semibold">Upload Processing Requirements</h3>
              </div>
              {/* Note: We default items with no category to 'processing' to preserve existing data display */}
              {renderRequirements(reqsToDisplay.filter(r => r.category === 'processing' || !r.category), targetContext)}
            </section>

            {/* SECTION 3: UPLOAD ISSUANCE REQUIREMENTS */}
            <section>
              <div className="flex items-center gap-2 mb-4">
                <div className="h-8 w-1 bg-emerald-500 rounded-full" />
                <h3 className="text-lg font-semibold">Upload Issuance Requirements</h3>
              </div>
              {renderRequirements(reqsToDisplay.filter(r => r.category === 'issuance'), targetContext)}
            </section>
          </div>
        ) : (
          /* STANDARD DISPLAY FOR OTHER DEPARTMENTS */
          renderRequirements(reqsToDisplay, targetContext)
        )}
      </div>
    )
  }

  // Renamed from renderRequirements to renderRequirements for clarity
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
                <TableHead className="border-r">Automation</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requirements.length > 0 ? (
                requirements.map((req, idx) => (
                  <TableRow key={req.id || idx} className="hover:bg-slate-50/50">
                    <TableCell className="text-center font-mono text-xs text-muted-foreground border-r">{idx + 1}</TableCell>
                    <TableCell className="border-r">
                      <div className="font-medium">{req.name}</div>
                      {req.description && <div className="text-xs text-muted-foreground line-clamp-1">{req.description}</div>}
                    </TableCell>
                    <TableCell className="border-r">{getTypeDisplay(req)}</TableCell>
                    <TableCell className="border-r">{getContextDisplay(req)}</TableCell>
                    <TableCell className="border-r">{getDocumentsDisplay(req)}</TableCell>
                    <TableCell className="border-r">{getAutomationDisplay(req)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-600" onClick={() => { setEditingRequirement(req); setEditingContext(context); setIsEditDialogOpen(true); }}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={() => { 
                          setEditingContext(context); 
                          setDeleteContext({ type: context.type, index: idx, requirementId: req.id }); 
                          setIsDeleteDialogOpen(true); 
                        }}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground italic bg-slate-50/30">
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
    const types = req.applicantTypes || []
    if (types.length === 0) return <span className="text-xs text-gray-400">-</span>
    return (
      <div className="flex flex-wrap gap-1">
        {types.map(t => <Badge key={t} variant="secondary" className="text-[10px] h-4 px-1 capitalize">{t}</Badge>)}
      </div>
    )
  }

  const getAutomationDisplay = (req: RequirementTableEntry) => {
    if (req.web_automation?.automationId) {
      return (
        <div className="flex items-center gap-1 text-blue-600">
          <Zap className="h-3.5 w-3.5 fill-current" />
          <span className="text-[11px] font-medium">{req.web_automation.automationName}</span>
        </div>
      )
    }
    return <span className="text-gray-400 text-[11px]">None</span>
  }

  const getDocumentsDisplay = (req: RequirementTableEntry) => {
    const documentIds = req.kyc_document_ids || []
    const documentCount = documentIds.length
    const documentNames = getDocumentNames(documentIds)

    if (documentCount === 0) {
      return <span className="text-gray-400 text-[11px]">No documents</span>
    }

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

    // 1. Check for existing record with this job_level
    const { data: existing, error: fetchError } = await supabase
      .from('tm_class_requirements')
      .select('*')
      .eq('job_level', JSON.stringify(payload.job_level))
      .maybeSingle();
    
    if (fetchError) throw fetchError;

    // 2. Update or Insert with legacy structure
    if (existing) {
      const { error: updateError } = await supabase
        .from('tm_class_requirements')
        .update({
          requirements: payload.requirements,
          updated_at: payload.updated_at
        })
        .eq('id', existing.id);
      if (updateError) throw updateError;
    } else {
      const { error: insertError } = await supabase
        .from('tm_class_requirements')
        .insert({ 
          ...payload, 
          created_at: new Date().toISOString() 
        });
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

const handleSaveRequirement = async (updatedRequirement: any) => {
  if (!editingContext) return;
  
  try {
    setIsSubmitting(true);

    // 1. Find the existing record for this job level
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
    if (!existing) throw new Error('No existing record found for this job level');

    // 2. Update the specific requirement in the array
    const updatedRequirements = existing.requirements.map((req: any) => 
      req.id === updatedRequirement.id ? updatedRequirement : req
    );

    // 3. Save the updated requirements array
    const { error: updateError } = await supabase
      .from('tm_class_requirements')
      .update({
        requirements: updatedRequirements,
        updated_at: new Date().toISOString()
      })
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

const handleDeleteRequirement = async (requirementId: string) => {
  if (!editingContext) return;
  
  try {
    setIsSubmitting(true);

    // 1. Find the existing record for this job level
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
    if (!existing) throw new Error('No existing record found for this job level');

    // 2. Remove the requirement from the array
    const updatedRequirements = existing.requirements.filter((req: any) => req.id !== requirementId);

    // 3. Reorder the remaining requirements
    const reorderedRequirements = updatedRequirements.map((req: any, index: number) => ({
      ...req,
      order: index
    }));

    // 4. Save the updated requirements array
    const { error: updateError } = await supabase
      .from('tm_class_requirements')
      .update({
        requirements: reorderedRequirements,
        updated_at: new Date().toISOString()
      })
      .eq('id', existing.id);
    
    if (updateError) throw updateError;

    await refreshDepartments();
    setIsDeleteDialogOpen(false);
    setDeleteContext(null);
    toast({ title: "Success", description: "Requirement deleted successfully" });
  } catch (error) {
    console.error(error);
    toast({ title: "Error", description: "Failed to delete requirement", variant: "destructive" });
  } finally {
    setIsSubmitting(false);
  }
};

  return (
    <div className="flex h-screen bg-slate-50/50">
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
      />

      <main className="flex-1 overflow-hidden">
        <div className="h-full overflow-auto p-4 space-y-4">
          <header className="flex items-center justify-between">
            <div>
              <h2 className="text-3xl font-bold tracking-tight">Upload Processing Requirements</h2>
              <p className="text-muted-foreground">
                {departments.find(d => String(d.id) === activeDept)?.name} 
                {activeSubdept[activeDept] && ` > ${departments.find(d => String(d.id) === activeDept)?.tm_subdepartments?.find(s => String(s.id) === activeSubdept[activeDept])?.name}`}
                {activeClass[activeSubdept[activeDept]] && ` > ${departments.find(d => String(d.id) === activeDept)?.tm_subdepartments?.find(s => String(s.id) === activeSubdept[activeDept])?.classes?.find(c => String(c.id) === activeClass[activeSubdept[activeDept]])?.name}`}
                {activeSubclass[activeClass[activeSubdept[activeDept]]] && ` > ${departments.find(d => String(d.id) === activeDept)?.tm_subdepartments?.find(s => String(s.id) === activeSubdept[activeDept])?.classes?.find(c => String(c.id) === activeClass[activeSubdept[activeDept]])?.subClasses?.find(sc => String(sc.id) === activeSubclass[activeClass[activeSubdept[activeDept]]])?.name}`}
              </p>
            </div>
          </header>

          {!activeDept ? (
            <Card>
              <CardHeader>
                <CardTitle>Upload Processing Requirements</CardTitle>
                <CardDescription>Select a department from the sidebar to get started</CardDescription>
              </CardHeader>
              <CardContent className="p-4 text-center py-8">
                <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">Choose a department to manage upload requirements.</p>
              </CardContent>
            </Card>
          ) : (
            renderMainContent()
          )}

          <AddRequirementsDialog isOpen={isAddDialogOpen} onOpenChange={setIsAddDialogOpen} onSubmit={handleAddRequirements} isSubmitting={isSubmitting} context={addContext} />
          <EditRequirementDialog isOpen={isEditDialogOpen} onOpenChange={setIsEditDialogOpen} requirement={editingRequirement} onSave={handleSaveRequirement} isSubmitting={isSubmitting} context={editingContext} />
          
          {/* Delete Confirmation Dialog */}
          <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete Requirement</DialogTitle>
                <DialogDescription>
                  Are you sure you want to delete this requirement? This action cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => deleteContext?.requirementId && handleDeleteRequirement(deleteContext.requirementId)}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Deleting...' : 'Delete'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </main>
    </div>
  )
}