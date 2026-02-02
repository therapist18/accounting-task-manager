// @ts-nocheck
'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import React, { useEffect, useState, useMemo } from "react"
import { cn } from "@/lib/utils"
import { Pencil, Trash2, ArrowUp, ArrowDown, Plus, X, Check, PanelLeft, LayoutGrid, ChevronRight, ChevronDown, FileText, Layers, AlertTriangle, Eye, EyeOff, Zap, FileType, Database, Code, HelpCircle } from "lucide-react"
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
import { EditJobQuestionDialog } from "./components/EditJobQuestionDialog"
import { COMPUTED_FUNCTIONS } from "@/lib/constants/computed-functions"

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
}

interface JobQuestion {
  id: string
  label: string
  type: string
  required: boolean
  options?: string[]
  linked_field_id?: string
  applicant_types?: string[]
  default_value?: string // Matches DB column name
  order: number
}

interface ApiRequirement {
  id?: string
  name: string
  description?: string
  type: 'standard' | 'conditional' | 'optional' | 'company' | 'multi-document'
  order: number
  isVisible: boolean
  isRequired: boolean
  kyc_document_ids?: string[]
  hasWebForm?: boolean
  webFormName?: string
  automationId?: string
  applicantTypes?: string[]
  requiredDocumentCount?: number
  billingEntity?: string
  instructions?: string
  requirement_context?: any
  web_automation?: any
  category?: 'general' | 'processing' | 'issuance'
  webdata?: WebDataField[]
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
  
  // State for expanding webdata rows
  const [expandedWebDataRows, setExpandedWebDataRows] = useState<Set<string>>(new Set())

  const [isSubmitting, setIsSubmitting] = useState(false)
  
  // Requirement Editing
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [editingRequirement, setEditingRequirement] = useState<ApiRequirement | null>(null)
  
  // Question Editing
  const [isEditQuestionDialogOpen, setIsEditQuestionDialogOpen] = useState(false)
  const [editingQuestion, setEditingQuestion] = useState<JobQuestion | null>(null)

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [addContext, setAddContext] = useState<EditingContext | null>(null)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [deleteContext, setDeleteContext] = useState<{ type: string, index: number, requirementId?: string, isQuestion?: boolean } | null>(null)
  const [editingContext, setEditingContext] = useState<EditingContext | null>(null)
  const [kycDocuments, setKycDocuments] = useState<any[]>([])
  const [masterFields, setMasterFields] = useState<any[]>([])

  // Fetch KYC documents and Master Fields for display
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [kycRes, mfRes] = await Promise.all([
          supabase.from('acc_portal_kyc').select('id, name, display_name').order('name'),
          supabase.from('tm_job_fields').select('id, label')
        ])
        setKycDocuments(kycRes.data || [])
        setMasterFields(mfRes.data || [])
      } catch (error) {
        console.error('Error fetching initial data:', error)
      }
    }
    fetchData()
  }, [])

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

  const mapRequirementsData = async (record: any) => {
    if (!record) return []
    if (!record.requirements) return []
    
    // Get all automation IDs from requirements
    const automationIds = record.requirements
      .filter((r: any) => {
        const automationId = r.automationId || r.automation_id || r.web_automation?.automationId;
        return !!automationId;
      })
      .map((r: any) => r.automationId || r.automation_id || r.web_automation.automationId)
    
    // Fetch automation data with webdata
    let automationWebData: any[] = []
    if (automationIds.length > 0) {
      const { data: automations, error } = await supabase
        .from('tm_automations')
        .select('id, webdata')
        .in('id', automationIds)
      if (error) {
        console.error('Error fetching automations:', error)
      } else {
        automationWebData = automations || []
      }
    }

    return record.requirements.map((r: any) => {
      const contextItem = record.requirement_context?.find((ctx: any) => String(ctx.requirementId) === String(r.id))
      const automationId = r.automationId || r.automation_id || r.web_automation?.automationId;
      const ctx = contextItem?.context || {}
      
      const docIds = r.kyc_document_ids || (r.kycDocumentId ? [r.kycDocumentId] : []);

      // Find webdata from linked automation
      const automation = automationWebData.find(a => a.id === automationId)
      const webdata = automation?.webdata || []
      
      return {
        ...r,
        applicantTypes: r.applicantTypes || ctx.applicantTypes || (r.applicantType ? [r.applicantType] : []),
        kyc_document_ids: docIds,
        requiredDocumentCount: ctx.requiredDocumentCount || r.requiredDocumentCount || 1,
        billingEntity: ctx.billingEntity || r.billingEntity || 'applicant',
        instructions: ctx.instructions || r.instructions || '',
        requirement_context: ctx,
        web_automation: r.web_automation || { automationId: automationId },
        webdata: webdata
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

          const classes = (subdept.classes || []).map(async (cls) => {
            const classRec = findRecord(String(cls.id), null)
            const subClasses = (cls.subClasses || []).map(async (subCls) => {
              const subClsRec = findRecord(String(cls.id), String(subCls.id))
              return { 
                ...subCls, 
                requirements: await mapRequirementsData(subClsRec || {}),
                job_specific_questions: subClsRec?.job_specific_questions || [] 
              }
            })
            const resolvedSubClasses = await Promise.all(subClasses)
            return { 
              ...cls, 
              requirements: await mapRequirementsData(classRec || {}), 
              job_specific_questions: classRec?.job_specific_questions || [],
              subClasses: resolvedSubClasses
            }
          })

          const resolvedClasses = await Promise.all(classes)

          const subDeptRec = findRecord(null, null)

          return {
            ...subdept,
            classes: resolvedClasses,
            upload_requirements: await mapRequirementsData(subDeptRec || {}),
            job_specific_questions: subDeptRec?.job_specific_questions || []
          }
        }))
        
        return { 
          ...dept, 
          subdepartments: resolvedSubdepartments, 
          tm_subdepartments: resolvedSubdepartments 
        }
      }))

      setDepartments(processedDepartments)
    } catch (error) {
      setDepartments([])
    }
  }

  useEffect(() => {
    refreshDepartments()
  }, [])

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
      ? { 
          type: 'subclass', 
          departmentId: currentDept.id, 
          subdepartmentId: currentSubdept.id, 
          classId: currentClass.id, 
          subclassId: currentSubclass.id, 
          subdepartmentName: currentSubdept.name, 
          className: currentClass.name, 
          subclassName: currentSubclass.name,
          jobLevel: {
            department_id: currentDept.id,
            subdepartment_id: currentSubdept.id,
            class_id: currentClass.id,
            subclass_id: currentSubclass.id
          }
        }
      : currentClass
      ? { 
          type: 'class', 
          departmentId: currentDept.id, 
          subdepartmentId: currentSubdept.id, 
          classId: currentClass.id, 
          subdepartmentName: currentSubdept.name, 
          className: currentClass.name,
          jobLevel: {
            department_id: currentDept.id,
            subdepartment_id: currentSubdept.id,
            class_id: currentClass.id,
            subclass_id: null
          }
        }
      : { 
          type: 'subdepartment', 
          departmentId: currentDept.id, 
          subdepartmentId: currentSubdept.id, 
          subdepartmentName: currentSubdept.name,
          jobLevel: {
            department_id: currentDept.id,
            subdepartment_id: currentSubdept.id,
            class_id: null,
            subclass_id: null
          }
        }
    
    const reqsToDisplay = (currentSubclass ? currentSubclass.requirements : currentClass ? currentClass.requirements : currentSubdept.upload_requirements) || []
    const questionsToDisplay = (currentSubclass ? currentSubclass.job_specific_questions : currentClass ? currentClass.job_specific_questions : currentSubdept.job_specific_questions) || []

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
            <section>
              <div className="flex items-center gap-2 mb-4"><div className="h-8 w-1 bg-blue-600 rounded-full" /><h3 className="text-lg font-semibold">General Requirements</h3></div>
              {renderRequirements(reqsToDisplay.filter(r => r.category === 'general'), targetContext)}
            </section>
            <section>
              <div className="flex items-center gap-2 mb-4"><div className="h-8 w-1 bg-amber-500 rounded-full" /><h3 className="text-lg font-semibold">Upload Processing Requirements</h3></div>
              {renderRequirements(reqsToDisplay.filter(r => r.category === 'processing' || !r.category), targetContext)}
            </section>
            <section>
              <div className="flex items-center gap-2 mb-4"><div className="h-8 w-1 bg-emerald-500 rounded-full" /><h3 className="text-lg font-semibold">Upload Issuance Requirements</h3></div>
              {renderRequirements(reqsToDisplay.filter(r => r.category === 'issuance'), targetContext)}
            </section>
          </div>
        ) : (
          renderRequirements(reqsToDisplay, targetContext)
        )}
        
        {/* Job Specific Questions Section */}
        <section className="pt-8 border-t">
           <div className="flex items-center gap-2 mb-4"><div className="h-8 w-1 bg-indigo-600 rounded-full" /><h3 className="text-lg font-semibold">Job Specific Questions</h3></div>
           {renderQuestions(questionsToDisplay, targetContext)}
        </section>
      </div>
    )
  }

 const renderQuestions = (questions: JobQuestion[], context: EditingContext) => {
    return (
      <div className="border rounded-lg overflow-hidden bg-white shadow-sm">
        <div className="overflow-auto max-h-[600px]">
           <Table>
            <TableHeader className="bg-slate-50 sticky top-0 z-10">
              <TableRow>
                <TableHead className="w-12 text-center border-r">#</TableHead>
                <TableHead className="min-w-[200px] border-r">Question Label</TableHead>
                <TableHead className="border-r">Input Type</TableHead>
                <TableHead className="border-r">Default Value</TableHead> {/* New Column */}
                <TableHead className="border-r">Required</TableHead>
                <TableHead className="border-r">Applies To</TableHead>
                <TableHead className="border-r">Configuration</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {questions.length > 0 ? (
                questions.map((q, idx) => {
                    const linkedMasterField = q.linked_field_id 
                        ? masterFields.find(mf => String(mf.id) === String(q.linked_field_id)) 
                        : null;

                    return (
                        <TableRow key={q.id || idx} className="hover:bg-slate-50/50">
                            <TableCell className="text-center font-mono text-xs text-muted-foreground border-r">{idx + 1}</TableCell>
                            <TableCell className="border-r font-medium">{q.label}</TableCell>
                            <TableCell className="border-r"><Badge variant="outline" className="capitalize bg-slate-100">{q.type}</Badge></TableCell>
                            
                            {/* New Default Value Cell */}
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
                                    {(q.applicant_types || []).length > 0 ? q.applicant_types?.map(t => (
                                        <Badge key={t} variant="secondary" className="text-[10px] h-4 px-1 capitalize">{t}</Badge>
                                    )) : <span className="text-xs text-slate-400">All</span>}
                                </div>
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
                            <TableCell className="text-right">
                                <div className="flex justify-end gap-1">
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
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground italic bg-slate-50/30">
                     No job specific questions configured.
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
                <TableHead className="border-r">Web Data</TableHead>
                <TableHead className="border-r">Automation</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requirements.length > 0 ? (
                requirements.map((req, idx) => {
                  const hasWebData = req.webdata && req.webdata.length > 0;
                  const isExpanded = expandedWebDataRows.has(req.id || `temp-${idx}`);

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
                          {(() => {
                            const hasWebData = req.webdata && req.webdata.length > 0;
                            return hasWebData ? (
                              <Badge 
                                variant={isExpanded ? "default" : "outline"}
                                className={cn("cursor-pointer hover:bg-blue-100 hover:text-blue-700 transition-colors", isExpanded && "bg-blue-600 hover:bg-blue-700")}
                                onClick={() => toggleWebDataRow(req.id || `temp-${idx}`)}
                              >
                                {isExpanded ? <ChevronDown className="h-3 w-3 mr-1"/> : <Code className="h-3 w-3 mr-1"/>}
                                {req.webdata.length} Fields
                              </Badge>
                            ) : (
                              <span className="text-xs text-slate-400">-</span>
                            )
                          })()}
                        </TableCell>
                        <TableCell className="border-r">{getAutomationDisplay(req)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
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
                          <TableCell colSpan={9} className="p-0 border-b border-t shadow-inner">
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
                                    {req.webdata.map((field, i) => (
                                      <TableRow key={i} className="hover:bg-slate-50/50">
                                        <TableCell className="py-2 text-xs font-mono text-blue-600">{field.variableName}</TableCell>
                                        <TableCell className="py-2 text-xs font-medium">{field.efnsDisplayName || field.name}</TableCell>
                                        <TableCell className="py-2 text-xs"><Badge variant="secondary" className="text-[10px] h-5">{field.fieldType}</Badge></TableCell>
                                        <TableCell className="py-2 text-xs capitalize text-slate-500">{field.entityType}</TableCell>
                                        <TableCell className="py-2 text-xs text-slate-400">
                                          {field.fieldType === 'document' 
                                            ? `Document: ${kycDocuments.find(d => d.id === field.kycDocumentId)?.display_name || 'Unknown'}`
                                            : field.linkedMasterFields?.length 
                                              ? field.linkedMasterFields.map(m => m.label).join(", ") 
                                              : "Manual / None"}
                                        </TableCell>
                                      </TableRow>
                                    ))}
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
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground italic bg-slate-50/30">
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
    const documentIds = req.kyc_document_ids || []
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

  const handleSaveRequirement = async (updatedRequirement: any) => {
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
      if (!existing) throw new Error('No existing record found');
      const updatedRequirements = existing.requirements.map((req: any) => 
        req.id === updatedRequirement.id ? updatedRequirement : req
      );
      const { error: updateError } = await supabase
        .from('tm_class_requirements')
        .update({ requirements: updatedRequirements, updated_at: new Date().toISOString() })
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
              </p>
            </div>
          </header>
          {!activeDept ? (
            <Card>
              <CardHeader><CardTitle>Upload Processing Requirements</CardTitle><CardDescription>Select a department</CardDescription></CardHeader>
              <CardContent className="p-4 text-center py-8"><FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" /><p className="text-muted-foreground">Choose a department to manage upload requirements.</p></CardContent>
            </Card>
          ) : renderMainContent()}
          <AddRequirementsDialog isOpen={isAddDialogOpen} onOpenChange={setIsAddDialogOpen} onSubmit={handleAddRequirements} isSubmitting={isSubmitting} context={addContext} />
          
          <EditRequirementDialog isOpen={isEditDialogOpen} onOpenChange={setIsEditDialogOpen} requirement={editingRequirement} onSave={handleSaveRequirement} isSubmitting={isSubmitting} context={editingContext} />
          
          <EditJobQuestionDialog 
             isOpen={isEditQuestionDialogOpen} 
             onOpenChange={setIsEditQuestionDialogOpen} 
             question={editingQuestion} 
             onSave={handleSaveQuestion} 
             isSubmitting={isSubmitting} 
             masterFields={masterFields}
          />

          <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
            <DialogContent>
              <DialogHeader><DialogTitle>Delete {deleteContext?.isQuestion ? 'Question' : 'Requirement'}</DialogTitle><DialogDescription>Are you sure?</DialogDescription></DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>Cancel</Button>
                <Button variant="destructive" onClick={() => deleteContext?.requirementId && handleDeleteRequirement(deleteContext.requirementId)} disabled={isSubmitting}>{isSubmitting ? 'Deleting...' : 'Delete'}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </main>
    </div>
  )
}