// @ts-nocheck
'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import React, { useEffect, useState, useMemo, useRef, useCallback } from "react"
import { cn } from "@/lib/utils"
import { Search, Pencil, Trash2, ArrowUp, ArrowDown, Plus, X, Check, PanelLeft, LayoutGrid, ChevronRight, ChevronDown, FileText, Layers, AlertTriangle, Eye, EyeOff, Zap, FileType, Database, Code, HelpCircle, Folder, Split, Building2, ChevronsUpDown } from "lucide-react"
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
import { DeleteConfirmationDialog } from "@/app/(dashboard)/dashboard/tasks/components/DeleteConfirmationDialog"
import { COMPUTED_FUNCTIONS } from "@/lib/constants/computed-functions"
import { ENTITY_TYPES, type EntityType } from "@/lib/constants/entity-types"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
import { getGroupedFields } from "@/app/(dashboard)/dashboard/departments/documents+fields/components/formFields"

const HighlightText = ({ text, highlight }: { text?: string | null, highlight?: string }) => {
  if (!text) return null;
  if (!highlight || !highlight.trim()) return <>{text}</>;
  const searchStr = highlight.trim();
  const regex = new RegExp(`(${searchStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  const parts = text.split(regex);
  return (
    <>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <mark key={i} className="bg-yellow-200 text-slate-900 rounded px-0.5 font-medium">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
};

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
  third_party_role?: string | null // When set, marks this boolean question as a third-party indicator
}

interface ReportDocDefault {
  id: string
  documentId: string
  documentName?: string
  docType: 'individual' | 'company' | 'application'
  appliesTo: string[]
  order: number
  isVisible: boolean
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

export default function UploadRequirements({ departments: initialDepartments, autoSelectJobLevel }: { departments: Department[]; autoSelectJobLevel?: { deptId?: string; subdeptId?: string; classId?: string; subclassId?: string; highlight?: boolean } | null }) {
  const [departments, setDepartments] = useState<Department[]>(initialDepartments || [])
  const [activeDept, setActiveDept] = useState<string>('')
  const [activeSubdept, setActiveSubdept] = useState<Record<string, string>>({})
  const [activeClass, setActiveClass] = useState<Record<string, string>>({})
  const [activeSubclass, setActiveSubclass] = useState<Record<string, string>>({})
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({})
  const [expandedWebDataRows, setExpandedWebDataRows] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [editingRequirement, setEditingRequirement] = useState<ApiRequirement | null>(null)
  const [isEditReportDocDialogOpen, setIsEditReportDocDialogOpen] = useState(false)
  const [editingReportDoc, setEditingReportDoc] = useState<any | null>(null)
  const [isEditQuestionDialogOpen, setIsEditQuestionDialogOpen] = useState(false)
  const [editingQuestion, setEditingQuestion] = useState<JobQuestion | null>(null)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [addContext, setAddContext] = useState<EditingContext | null>(null)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [deleteContext, setDeleteContext] = useState<{ type: string, index: number, requirementId?: string, isQuestion?: boolean } | null>(null)
  const [isRemoveReportDocConfirmOpen, setIsRemoveReportDocConfirmOpen] = useState(false)
  const [removingReportDocId, setRemovingReportDocId] = useState<string | null>(null)
  const [editingContext, setEditingContext] = useState<EditingContext | null>(null)
  const [kycDocuments, setKycDocuments] = useState<any[]>([])
  const [masterFields, setMasterFields] = useState<any[]>([])
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [banks, setBanks] = useState<any[]>([]);
  const [selectedBank, setSelectedBank] = useState<any | null>(null);
  const [disabledInheritedReqs, setDisabledInheritedReqs] = useState<Set<string>>(new Set());
  const [allAutomations, setAllAutomations] = useState<{ id: string; name: string; webdata: WebDataField[]; is_active?: boolean }[]>([]);
  const [expandedAutomationConfig, setExpandedAutomationConfig] = useState<Set<string>>(new Set());
  const [pendingQuestionClientReqs, setPendingQuestionClientReqs] = useState<Record<string, boolean>>({});
  const [pendingRequirementClientReqs, setPendingRequirementClientReqs] = useState<Record<string, boolean>>({});
  const [pendingWebdataClientReqs, setPendingWebdataClientReqs] = useState<Record<string, Record<number, { value: boolean; arrayItems?: Record<number, boolean> }>>>({});
  const [reportDocDefaults, setReportDocDefaults] = useState<ReportDocDefault[]>([]);
  const [activeMainTab, setActiveMainTab] = useState("logic")
  const [logicTab, setLogicTab] = useState("")
  const [checklistDocuments, setChecklistDocuments] = useState<any[]>([])
  const [checklistDocAllocations, setChecklistDocAllocations] = useState<Record<string, any>>({})
  const [checklistClientAllocations, setChecklistClientAllocations] = useState<Record<string, any>>({})
  const [expandedChecklistCategories, setExpandedChecklistCategories] = useState<Set<string>>(new Set())
  const [checklistDocumentTab, setChecklistDocumentTab] = useState<"company" | "individual" | "application">("company")
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

    const reportDocDefaults = (currentSubclass ? currentSubclass.report_doc_defaults : currentClass ? currentClass.report_doc_defaults : currentSubdept.report_doc_defaults) || []

    return { currentDept, currentSubdept, currentClass, currentSubclass, reqs, questions, reportDocDefaults }
  }, [departments, activeDept, activeSubdept, activeClass, activeSubclass])

  // --- 2. DESTUCTURE FOR DIALOGS ---
  const { currentDept, currentSubdept, currentClass, currentSubclass, reqs, questions, reportDocDefaults: activeReportDocDefaults } = activeSelection

  // Filter automations to only those linked to the current job level's requirements
  const jobLevelAutomations = useMemo(() => {
    const automationIds = new Set<string>()
    // Collect automation IDs from individual requirements
    reqs.forEach((req: any) => {
      if (req.web_automation?.automationId) {
        automationIds.add(req.web_automation.automationId)
      }
    })
    // Also check class-level web_automation array
    const classRecord = currentSubclass || currentClass
    if (classRecord?.web_automation && Array.isArray(classRecord.web_automation)) {
      classRecord.web_automation.forEach((auto: any) => {
        if (auto.automationId) automationIds.add(auto.automationId)
      })
    }
    // Filter allAutomations to only linked ones
    if (automationIds.size === 0) return []
    return allAutomations.filter(a => automationIds.has(a.id))
  }, [reqs, currentClass, currentSubclass, allAutomations])

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

  useEffect(() => {
    if (!activeDept) { setLogicTab(""); return }
    const isDept1 = String(activeDept) === "1"
    const validTabs = isDept1
      ? ['general', 'processing', 'issuance', 'reference', 'questions', 'webdata', 'reportdocs']
      : ['requirements', 'questions', 'webdata', 'reportdocs']
    setLogicTab(prev => (validTabs.includes(prev) ? prev : (isDept1 ? 'general' : 'requirements')))
  }, [activeDept])

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
            job_specific_questions: subDeptRec?.job_specific_questions || [],
            report_doc_defaults: subDeptRec?.report_doc_defaults || []
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

  useEffect(() => {
    const fetchReportDocDefaults = async () => {
      if (!currentDept || !currentSubdept) { setReportDocDefaults([]); return; }
      try {
        const jobLevel: any = {
          department_id: Number(currentDept.id),
          subdepartment_id: Number(currentSubdept.id),
          class_id: currentClass ? Number(currentClass.id) : null,
          subclass_id: currentSubclass ? Number(currentSubclass.id) : null,
          level: currentSubclass ? 4 : currentClass ? 3 : 2
        };
        const { data, error } = await supabase
          .from('tm_class_requirements')
          .select('report_doc_defaults')
          .eq('job_level', JSON.stringify(jobLevel))
          .maybeSingle();
        if (error) throw error;
        setReportDocDefaults((data?.report_doc_defaults || []).sort((a: any, b: any) => (a.order || 0) - (b.order || 0)));
      } catch (err) {
        console.error('Error fetching report doc defaults:', err);
        setReportDocDefaults([]);
      }
    };
    fetchReportDocDefaults();
  }, [currentDept, currentSubdept, currentClass, currentSubclass]);

  // Fetch checklist data (KYC documents + document/field allocations for current job level)
  useEffect(() => {
    const fetchChecklistData = async () => {
      try {
        const [docsRes, reqRes] = await Promise.all([
          supabase.from('acc_portal_kyc').select('id, name, display_name, category, main_category, main_category_number, custom_order, document_number, fields').order('main_category_number', { ascending: true }),
          currentDept && currentSubdept ? supabase
            .from('tm_class_requirements')
            .select('documents_and_fields, client_fields, job_level')
            .eq('job_level', JSON.stringify({
              department_id: Number(currentDept.id),
              subdepartment_id: Number(currentSubdept.id),
              class_id: currentClass ? Number(currentClass.id) : null,
              subclass_id: currentSubclass ? Number(currentSubclass.id) : null,
              level: currentSubclass ? 4 : currentClass ? 3 : 2
            }))
            .maybeSingle()
            : { data: null, error: null }
        ])

        if (docsRes.error) throw docsRes.error
        if (reqRes.error) throw reqRes.error

        const processedDocs = (docsRes.data || []).map(doc => ({
          ...doc,
          fields: Array.isArray(doc.fields) ? doc.fields : [],
          display_name: doc.display_name || doc.name
        }))
        setChecklistDocuments(processedDocs)

        // Build document allocations map: key = `${docId}::${columnKey}`, value = { entity_type: true }
        const docAllocs: Record<string, any> = {}
        const clientAllocs: Record<string, any> = {}
        if (reqRes.data) {
          const colKey = [
            reqRes.data.job_level?.subdepartment_id,
            reqRes.data.job_level?.class_id,
            reqRes.data.job_level?.subclass_id
          ].filter(id => id != null).join('_')

          ;(reqRes.data.documents_and_fields || []).forEach((doc: any) => {
            const docId = String(doc.id)
            Object.keys(doc).forEach(key => {
              if (!['id', 'fields', 'updated_at'].includes(key) && doc[key] === true) {
                docAllocs[`${docId}::${colKey}`] = { ...(docAllocs[`${docId}::${colKey}`] || {}), [key]: true }
              }
            })
            ;(doc.fields || []).forEach((f: any) => {
              const fieldId = String(f.id)
              Object.keys(f).forEach(key => {
                if (!['id', 'updated_at'].includes(key) && f[key] === true) {
                  docAllocs[`${docId}|${fieldId}::${colKey}`] = { ...(docAllocs[`${docId}|${fieldId}::${colKey}`] || {}), [key]: true }
                }
              })
            })
          })

          ;(reqRes.data.client_fields || []).forEach((item: any) => {
            const fieldId = String(item.id)
            const flags: any = {}
            if (item.ap === true || item.display === true) flags.ap = true
            if (item.dp === true) flags.dp = true
            if (item.understudy === true) flags.understudy = true
            if (item.references === true) flags.references = true
            if (fieldId && Object.keys(flags).length > 0) {
              clientAllocs[`${fieldId}::${colKey}`] = { ...(clientAllocs[`${fieldId}::${colKey}`] || {}), ...flags }
            }
          })
        }
        setChecklistDocAllocations(docAllocs)
        setChecklistClientAllocations(clientAllocs)
      } catch (err) {
        console.error('Error fetching checklist data:', err)
        setChecklistDocuments([])
        setChecklistDocAllocations({})
        setChecklistClientAllocations({})
      }
    }
    fetchChecklistData()
  }, [currentDept, currentSubdept, currentClass, currentSubclass]);

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

  const toggleChecklistCategory = (key: string) => {
    setExpandedChecklistCategories(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  const CHECKLIST_ENTITY_TYPES = ['company', 'principal', 'director', 'shareholder', 'dependant', 'employee', 'understudy', 'sponsor'] as const

  const CATEGORY_MAPPING: Record<string, string> = { company: 'company-docs', individual: 'directors-docs', application: 'application-docs' }

  const renderChecklist = () => {
    if (!currentDept || !currentSubdept) {
      return <div className="p-10 text-center text-muted-foreground italic">Select a job level to view its requirement checklist.</div>
    }

    const colKey = [
      currentSubdept.id,
      currentClass?.id || null,
      currentSubclass?.id || null
    ].filter(id => id != null).join('_')

    const checkDocAlloc = (docId: string, entityType: string) => {
      const entry = checklistDocAllocations[`${docId}::${colKey}`]
      return !!entry?.[entityType]
    }

    const isDocAllocated = (docId: string) => CHECKLIST_ENTITY_TYPES.some(et => checkDocAlloc(docId, et))

    const checkClientFieldAlloc = (allocationKey: string) => {
      const entry = checklistClientAllocations[`${allocationKey}::${colKey}`]
      if (!entry) return false
      return !!(entry.ap || entry.dp || entry.understudy || entry.references)
    }

    const getCategoryBadge = (allocated: boolean) =>
      allocated
        ? <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">✓</span>
        : <span className="text-slate-300">—</span>

    const docTabs = [
      { value: 'company' as const, label: 'Company Documents', category: 'company-docs' },
      { value: 'individual' as const, label: 'Individual Documents', category: 'directors-docs' },
      { value: 'application' as const, label: 'Application Documents', category: 'application-docs' },
    ]

    const currentDocTab = docTabs.find(t => t.value === checklistDocumentTab) || docTabs[0]
    const filteredDocs = checklistDocuments
      .filter(d => d.category === currentDocTab.category)
      .filter(d => isDocAllocated(d.id))
      .sort((a, b) => (a.main_category_number || 0) - (b.main_category_number || 0) || (a.custom_order || 0) - (b.custom_order || 0))

    const docsByCategory: Record<string, any[]> = {}
    filteredDocs.forEach(doc => {
      const cat = doc.main_category || 'Uncategorized'
      if (!docsByCategory[cat]) docsByCategory[cat] = []
      docsByCategory[cat].push(doc)
    })

    const formType = checklistDocumentTab === 'individual' ? 'individual' : 'company'
    const groupedClientFields = getGroupedFields(formType)

    const jobLevelLabel = [
      currentDept.name,
      currentSubdept.name,
      currentClass?.name,
      currentSubclass?.name
    ].filter(Boolean).join(' › ')

    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3 text-sm text-muted-foreground bg-slate-50 rounded-lg px-4 py-2">
          <FileText className="h-4 w-4 text-blue-500" />
          <span>Viewing checklist for: <strong className="text-foreground">{jobLevelLabel}</strong></span>
        </div>

        {/* Documents Section */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="h-5 w-5 text-blue-600" />
              Documents
            </CardTitle>
            <CardDescription>KYC document allocations for this job level</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="border-t">
              <div className="flex border-b bg-slate-50/60">
                {docTabs.map(tab => (
                  <button
                    key={tab.value}
                    onClick={() => setChecklistDocumentTab(tab.value)}
                    className={cn(
                      "px-4 py-2.5 text-sm font-medium border-b-2 transition-colors",
                      checklistDocumentTab === tab.value
                        ? "border-blue-600 text-blue-700 bg-white"
                        : "border-transparent text-muted-foreground hover:text-foreground hover:bg-slate-100/50"
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="overflow-auto max-h-[500px]">
                <Table>
                  <TableHeader className="bg-slate-50 sticky top-0 z-10">
                    <TableRow>
                      <TableHead className="w-12 text-center border-r">#</TableHead>
                      <TableHead className="min-w-[240px] border-r">Document</TableHead>
                      {CHECKLIST_ENTITY_TYPES.map(et => (
                        <TableHead key={et} className="border-r text-center text-[10px] uppercase tracking-wider min-w-[80px]">
                          {et}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.keys(docsByCategory).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={2 + CHECKLIST_ENTITY_TYPES.length} className="text-center py-8 text-muted-foreground italic">
                          No documents configured for this tab.
                        </TableCell>
                      </TableRow>
                    ) : Object.entries(docsByCategory).map(([category, docs]) => {
                      const catKey = `doc-cat-${checklistDocumentTab}-${category}`
                      const isExpanded = expandedChecklistCategories.has(catKey)
                      return (
                        <React.Fragment key={catKey}>
                          <TableRow
                            className="bg-slate-50/80 cursor-pointer hover:bg-slate-100/80 border-y"
                            onClick={() => toggleChecklistCategory(catKey)}
                          >
                            <TableCell colSpan={2 + CHECKLIST_ENTITY_TYPES.length} className="py-2 px-4">
                              <div className="flex items-center gap-2">
                                {isExpanded ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
                                <span className="font-semibold text-xs uppercase text-slate-600">{category}</span>
                                <Badge variant="secondary" className="text-[10px] ml-1">{docs.length}</Badge>
                              </div>
                            </TableCell>
                          </TableRow>
                          {isExpanded && docs.map((doc, idx) => (
                            <TableRow key={doc.id} className="hover:bg-blue-50/20">
                              <TableCell className="text-center font-mono text-xs text-muted-foreground border-r">{idx + 1}</TableCell>
                              <TableCell className="border-r font-medium text-sm">
                                {doc.display_name || doc.name || 'Unknown Document'}
                              </TableCell>
                              {CHECKLIST_ENTITY_TYPES.map(et => (
                                <TableCell key={et} className="border-r text-center">
                                  {getCategoryBadge(checkDocAlloc(doc.id, et))}
                                </TableCell>
                              ))}
                            </TableRow>
                          ))}
                        </React.Fragment>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Client Fields Section */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Database className="h-5 w-5 text-purple-600" />
              Client Fields
            </CardTitle>
            <CardDescription>Form sections and platform credentials allocated to this job level</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-auto max-h-[600px]">
              <Table>
                <TableHeader className="bg-slate-50 sticky top-0 z-10">
                  <TableRow>
                    <TableHead className="w-12 text-center border-r">#</TableHead>
                    <TableHead className="min-w-[240px] border-r">Field</TableHead>
                    <TableHead className="border-r text-center min-w-[100px]">Allocated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {/* Form Sections */}
                  {Object.entries(groupedClientFields.formSections).map(([key, section]) => {
                    const allocatedFields = (section.fields || [])
                      .filter(f => f.showInTable !== false)
                      .filter(f => checkClientFieldAlloc(`form-field-${f.name}`))
                    if (!allocatedFields.length) return null
                    const secKey = `client-sec-${formType}-${key}`
                    const isExpanded = expandedChecklistCategories.has(secKey)
                    return (
                      <React.Fragment key={secKey}>
                        <TableRow
                          className="bg-blue-50/60 cursor-pointer hover:bg-blue-100/60 border-y"
                          onClick={() => toggleChecklistCategory(secKey)}
                        >
                          <TableCell colSpan={3} className="py-2 px-4">
                            <div className="flex items-center gap-2">
                              {isExpanded ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
                              <span className="font-semibold text-xs uppercase text-blue-700">{section.title}</span>
                              <Badge variant="secondary" className="text-[10px] bg-blue-100 text-blue-600">{allocatedFields.length} field{allocatedFields.length !== 1 ? 's' : ''} allocated</Badge>
                            </div>
                          </TableCell>
                        </TableRow>
                        {isExpanded && allocatedFields.map((field, idx) => {
                          return (
                            <TableRow key={`${secKey}-${field.name}`} className="hover:bg-blue-50/20">
                              <TableCell className="text-center font-mono text-xs text-muted-foreground border-r">{idx + 1}</TableCell>
                              <TableCell className="border-r text-sm">
                                <div className="flex items-center gap-2">
                                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
                                  {field.tableHeader || field.label || field.name}
                                </div>
                              </TableCell>
                              <TableCell className="border-r text-center">
                                {getCategoryBadge(true)}
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </React.Fragment>
                    )
                  })}

                  {/* Platform Credentials */}
                  {Object.entries(groupedClientFields.platformCredentials).map(([platformKey, platform]) => {
                    const allocatedFields = (platform.fields || [])
                      .filter(f => f.showInTable !== false)
                      .filter(f => checkClientFieldAlloc(`platform-${platformKey}-${f.name}`))
                    if (!allocatedFields.length) return null
                    const platKey = `client-plat-${formType}-${platformKey}`
                    const isExpanded = expandedChecklistCategories.has(platKey)
                    return (
                      <React.Fragment key={platKey}>
                        <TableRow
                          className="bg-purple-50/60 cursor-pointer hover:bg-purple-100/60 border-y"
                          onClick={() => toggleChecklistCategory(platKey)}
                        >
                          <TableCell colSpan={3} className="py-2 px-4">
                            <div className="flex items-center gap-2">
                              {isExpanded ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
                              <span className="font-semibold text-xs uppercase text-purple-700">{platform.title}</span>
                              <Badge variant="secondary" className="text-[10px] bg-purple-100 text-purple-600">{allocatedFields.length} field{allocatedFields.length !== 1 ? 's' : ''} allocated</Badge>
                            </div>
                          </TableCell>
                        </TableRow>
                        {isExpanded && allocatedFields.map((field, idx) => {
                          return (
                            <TableRow key={`${platKey}-${field.name}`} className="hover:bg-purple-50/20">
                              <TableCell className="text-center font-mono text-xs text-muted-foreground border-r">{idx + 1}</TableCell>
                              <TableCell className="border-r text-sm">
                                <div className="flex items-center gap-2">
                                  <span className="w-1.5 h-1.5 rounded-full bg-purple-400 shrink-0" />
                                  {field.tableHeader || field.label || field.name}
                                </div>
                              </TableCell>
                              <TableCell className="border-r text-center">
                                {getCategoryBadge(true)}
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </React.Fragment>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    )
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

    const query = searchQuery.toLowerCase().trim()

    const filteredReqs = reqs.filter(r => {
      if (!query) return true;
      const matchName = r.name?.toLowerCase().includes(query)
      const matchDesc = r.description?.toLowerCase().includes(query)
      const matchType = r.type?.toLowerCase().includes(query)
      const matchWebData = r.webdata?.some((wd: any) =>
        wd.name?.toLowerCase().includes(query) ||
        wd.variableName?.toLowerCase().includes(query) ||
        wd.efnsDisplayName?.toLowerCase().includes(query)
      )
      return matchName || matchDesc || matchType || matchWebData;
    })

    const filteredQuestions = questions.filter(q => {
      if (!query) return true;
      return q.label?.toLowerCase().includes(query) ||
             q.type?.toLowerCase().includes(query) ||
             q.default_value?.toLowerCase().includes(query)
    })

    const filteredAutomations = jobLevelAutomations.filter(a => {
      if (!query) return true;
      if (a.name?.toLowerCase().includes(query)) return true;
      return a.webdata?.some(wd =>
        wd.name?.toLowerCase().includes(query) ||
        wd.variableName?.toLowerCase().includes(query) ||
        wd.efnsDisplayName?.toLowerCase().includes(query) ||
        wd.arrayItems?.some((ai: any) =>
           ai.variableName?.toLowerCase().includes(query) ||
           ai.displayName?.toLowerCase().includes(query) ||
           ai.efnsDisplayName?.toLowerCase().includes(query)
        )
      );
    })

    const isDept1 = String(activeDept) === "1"

    const logicTabDefs = isDept1
      ? [
          {
            value: 'general', label: 'General Requirements',
            content: filteredReqs.filter(r => r.category === 'general').length > 0
              ? renderRequirements(filteredReqs.filter(r => r.category === 'general'), targetContext)
              : <div className="text-center py-8 text-muted-foreground italic bg-slate-50/30 rounded-lg border">No requirements found in this section.</div>
          },
          {
            value: 'processing', label: 'Processing Requirements',
            content: filteredReqs.filter(r => r.category === 'processing' || !r.category).length > 0
              ? renderRequirements(filteredReqs.filter(r => r.category === 'processing' || !r.category), targetContext)
              : <div className="text-center py-8 text-muted-foreground italic bg-slate-50/30 rounded-lg border">No requirements found in this section.</div>
          },
          {
            value: 'issuance', label: 'Issuance Requirements',
            content: filteredReqs.filter(r => r.category === 'issuance').length > 0
              ? renderRequirements(filteredReqs.filter(r => r.category === 'issuance'), targetContext)
              : <div className="text-center py-8 text-muted-foreground italic bg-slate-50/30 rounded-lg border">No requirements found in this section.</div>
          },
          {
            value: 'reference', label: 'Reference Requirements',
            content: filteredReqs.filter(r => r.category === 'reference').length > 0
              ? renderRequirements(filteredReqs.filter(r => r.category === 'reference'), targetContext)
              : <div className="text-center py-8 text-muted-foreground italic bg-slate-50/30 rounded-lg border">No requirements found in this section.</div>
          },
          {
            value: 'questions', label: 'Job Specific Questions',
            content: renderQuestions(filteredQuestions, targetContext)
          },
          {
            value: 'webdata', label: 'Web Data Configuration',
            content: renderWebDataConfigurationSection(filteredAutomations)
          },
          {
            value: 'reportdocs', label: 'Report Doc Default',
            content: renderReportDocDefaults(targetContext)
          },
        ]
      : [
          {
            value: 'requirements', label: 'Requirements',
            content: renderRequirements(filteredReqs, targetContext)
          },
          {
            value: 'questions', label: 'Job Specific Questions',
            content: renderQuestions(filteredQuestions, targetContext)
          },
          {
            value: 'webdata', label: 'Web Data Configuration',
            content: renderWebDataConfigurationSection(filteredAutomations)
          },
          {
            value: 'reportdocs', label: 'Report Doc Default',
            content: renderReportDocDefaults(targetContext)
          },
        ]

    return (
      <div className="space-y-8">
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

       <Tabs value={logicTab || (isDept1 ? 'general' : 'requirements')} onValueChange={setLogicTab}>
         <TabsList className="w-full justify-start h-auto bg-slate-50 border rounded-lg p-1 gap-1 overflow-x-auto">
           {logicTabDefs.map(tab => (
             <TabsTrigger key={tab.value} value={tab.value} className="rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-foreground whitespace-nowrap">
               {tab.label}
             </TabsTrigger>
           ))}
         </TabsList>

         {logicTabDefs.map(tab => (
           <TabsContent key={tab.value} value={tab.value} className="mt-0">
             <div className="max-h-[calc(100vh-320px)] overflow-y-auto pt-3">
               {tab.content}
             </div>
           </TabsContent>
         ))}
       </Tabs>
      </div>
    )
  }

  // --- RENDER QUESTIONS HELPER ---
  const renderQuestions = (questionsToRender: JobQuestion[], context: EditingContext) => {
    const grouped = (questionsToRender || []).reduce((acc, q) => {
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
                <TableHead className="border-r">Third Party</TableHead>
                <TableHead className="w-16 text-center border-r">
                  {(() => {
                    const total = questionsToRender.length;
                    const checked = questionsToRender.filter(q => q.id in pendingQuestionClientReqs ? pendingQuestionClientReqs[q.id] : !!q.is_client_requirement).length;
                    const allChecked = total > 0 && checked === total;
                    const someChecked = total > 0 && checked > 0 && checked < total;
                    return (
                      <div className="flex flex-col items-center gap-0.5">
                        <span className="text-[10px] font-normal leading-none">Client Req.</span>
                        <Checkbox
                          checked={allChecked}
                          ref={(el) => { if (el) el.dataset.state = someChecked ? 'indeterminate' : (allChecked ? 'checked' : 'unchecked'); }}
                          onCheckedChange={(c) => handleToggleAllQuestionsClientRequirement(!!c, questionsToRender)}
                          className="mx-auto"
                        />
                      </div>
                    );
                  })()}
                </TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Object.keys(grouped).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="text-center py-8 text-muted-foreground italic bg-slate-50/30">
                    No matching questions found.
                  </TableCell>
                </TableRow>
              ) : Object.entries(grouped).map(([category, items]) => (
                <React.Fragment key={category}>
                  <TableRow className="bg-slate-50 border-y"><TableCell colSpan={11} className="py-2 px-4 font-bold text-xs uppercase text-slate-500">{category}</TableCell></TableRow>
                  {items.map((q, idx) => {
                    const linkedMasterField = q.linked_field_id
                      ? masterFields.find(mf => String(mf.id) === String(q.linked_field_id))
                      : null;
                    const absoluteIndex = activeSelection.questions.findIndex(item => item.id === q.id);
                    return (
                      <TableRow key={q.id} className="hover:bg-blue-50/30">
                        <TableCell className="text-center font-mono text-xs text-muted-foreground border-r">{idx + 1}</TableCell>
                        <TableCell className="border-r font-medium">
                          <HighlightText text={q.label} highlight={searchQuery} />
                        </TableCell>
                        <TableCell className="border-r"><Badge variant="outline" className="capitalize bg-slate-100">{q.type}</Badge></TableCell>
                        <TableCell className="border-r">
                          {q.default_value ? (
                            <span className="text-xs font-mono bg-slate-50 px-1.5 py-0.5 rounded border text-slate-600">
                              <HighlightText text={q.default_value} highlight={searchQuery} />
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
                        <TableCell className="border-r text-xs text-center">
                          {q.third_party_role ? (
                            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[10px]">
                              {q.third_party_role}
                            </Badge>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </TableCell>
                        <TableCell className="border-r text-center">
                          <Checkbox
                            checked={q.id in pendingQuestionClientReqs ? pendingQuestionClientReqs[q.id] : !!q.is_client_requirement}
                            disabled={isSubmitting}
                            onCheckedChange={(checked) => handleToggleQuestionClientRequirement(q, context, !!checked)}
                            className="mx-auto"
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost" size="icon" className="h-8 w-8 text-slate-400"
                              disabled={absoluteIndex <= 0 || isSubmitting}
                              onClick={() => handleMoveItem('question', absoluteIndex, 'up', context)}
                            >
                              <ArrowUp className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost" size="icon" className="h-8 w-8 text-slate-400"
                              disabled={absoluteIndex === -1 || absoluteIndex === activeSelection.questions.length - 1 || isSubmitting}
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

  // --- RENDER WEB DATA CONFIGURATION HELPER ---
  const renderWebDataConfigurationSection = (automationsToRender: any[]) => {
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
              {automationsToRender.length > 0 ? (
                automationsToRender.map((automation, idx) => {
                  const fields = automation.webdata || [];
                  const isExpanded = expandedAutomationConfig.has(automation.id) || (!!searchQuery && fields.some((wd: any) =>
                    wd.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    wd.variableName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    wd.efnsDisplayName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    wd.arrayItems?.some((ai: any) =>
                      ai.variableName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                      ai.displayName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                      ai.efnsDisplayName?.toLowerCase().includes(searchQuery.toLowerCase())
                    )
                  ));

                  return (
                    <React.Fragment key={automation.id}>
                      <TableRow className={cn("hover:bg-slate-50/50 cursor-pointer", isExpanded && "bg-slate-50 border-b-0")} onClick={() => toggleAutomationConfigRow(automation.id)}>
                        <TableCell className="text-center font-mono text-xs text-muted-foreground border-r">{idx + 1}</TableCell>
                        <TableCell className="border-r">
                          <div className="flex items-center gap-2 font-medium">
                            {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-slate-400" /> : <ChevronRight className="h-3.5 w-3.5 text-slate-400" />}
                            <Zap className="h-4 w-4 text-blue-600" />
                            <HighlightText text={automation.name || 'Unnamed Automation'} highlight={searchQuery} />
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
                                      <TableHead className="h-8 text-xs font-bold text-center">
                                        {(() => {
                                          const total = fields.length;
                                          const checked = fields.filter((f, i) => {
                                            const autoUpdate = pendingWebdataClientReqs[automation.id];
                                            const fieldUpdate = autoUpdate?.[i];
                                            if (fieldUpdate) return fieldUpdate.value;
                                            return f.is_client_requirement || (f.arrayItems || []).length > 0 && f.arrayItems.every(item => item.is_client_requirement);
                                          }).length;
                                          const allChecked = total > 0 && checked === total;
                                          const someChecked = total > 0 && checked > 0 && checked < total;
                                          return (
                                            <div className="flex flex-col items-center gap-0.5">
                                              <span className="text-[10px] font-normal leading-none">Client Requirement</span>
                                              <Checkbox
                                                checked={allChecked}
                                                ref={(el) => { if (el) el.dataset.state = someChecked ? 'indeterminate' : (allChecked ? 'checked' : 'unchecked'); }}
                                                onCheckedChange={(c) => handleToggleAllWebdataFieldsClientRequirement(automation.id, !!c)}
                                                className="mx-auto"
                                              />
                                            </div>
                                          );
                                        })()}
                                      </TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {fields.map((field: any, fieldIndex: number) => {
                                      const isArray = field.fieldType === 'array';
                                      const arrayItems = isArray ? (field.arrayItems || []) : [];
                                      const isFieldExpanded = expandedWebDataRows.has(`${automation.id}-${field.variableName}`) ||
                                        (!!searchQuery && arrayItems.some((ai: any) =>
                                          ai.variableName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                          ai.displayName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                          ai.efnsDisplayName?.toLowerCase().includes(searchQuery.toLowerCase())
                                        ));
                                      
                                      return (
                                        <React.Fragment key={fieldIndex}>
                                          <TableRow className={cn("hover:bg-slate-50/50", isArray && "cursor-pointer")} onClick={isArray ? () => {
                                            const key = `${automation.id}-${field.variableName}`;
                                            setExpandedWebDataRows(prev => {
                                              const next = new Set(prev);
                                              if (next.has(key)) next.delete(key); else next.add(key);
                                              return next;
                                            });
                                          } : undefined}>
                                            <TableCell className="py-2 text-xs font-mono text-blue-600">
                                              <div className="flex items-center gap-1.5">
                                                {isArray && (isFieldExpanded ? <ChevronDown className="h-3 w-3 text-slate-400" /> : <ChevronRight className="h-3 w-3 text-slate-400" />)}
                                                <HighlightText text={field.variableName} highlight={searchQuery} />
                                              </div>
                                            </TableCell>
                                            <TableCell className="py-2 text-xs font-medium">
                                              <HighlightText text={field.efnsDisplayName || field.name} highlight={searchQuery} />
                                            </TableCell>
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
                                                checked={(() => {
                                                  const autoUpdate = pendingWebdataClientReqs[automation.id];
                                                  const fieldUpdate = autoUpdate?.[fieldIndex];
                                                  return fieldUpdate ? fieldUpdate.value : !!field.is_client_requirement;
                                                })()}
                                                onCheckedChange={(checked) => handleToggleWebdataFieldClientRequirement(automation.id, fieldIndex, !!checked)}
                                                className="mx-auto"
                                              />
                                            </TableCell>
                                          </TableRow>
                                          {isArray && isFieldExpanded && arrayItems.map((item: any, itemIdx: number) => (
                                            <TableRow key={`${fieldIndex}-item-${itemIdx}`} className="bg-blue-50/30 hover:bg-blue-50/50">
                                              <TableCell className="py-1.5 pl-8 text-[10px] font-mono text-blue-400">
                                                <HighlightText text={`${field.variableName}[${itemIdx}]`} highlight={searchQuery} />
                                              </TableCell>
                                              <TableCell className="py-1.5 text-[10px] font-medium text-slate-600">
                                                <div className="flex items-center gap-1.5 pl-2">
                                                  <span className="w-1 h-1 bg-blue-400 rounded-full" />
                                                  <HighlightText text={item.displayName || item.efnsDisplayName || item.variableName} highlight={searchQuery} />
                                                </div>
                                              </TableCell>
                                              <TableCell className="py-1.5 text-[10px]"><Badge variant="outline" className="text-[9px] h-4 bg-slate-50">{item.fieldType || 'text'}</Badge></TableCell>
                                              <TableCell className="py-1.5 text-[10px] capitalize text-slate-400">{Array.isArray(item.entityTypes) ? item.entityTypes.join(', ') : (item.entityType || '-')}</TableCell>
                                              <TableCell className="py-1.5 text-[10px] text-slate-400">
                                                {item.linkedMasterFields?.length ? `${item.linkedMasterFields.length} linked field(s)` : "Manual / None"}
                                              </TableCell>
                                              <TableCell className="py-1.5 text-center">
                                                <Checkbox
                                                  checked={(() => {
                                                    const autoUpdate = pendingWebdataClientReqs[automation.id];
                                                    const fieldUpdate = autoUpdate?.[fieldIndex];
                                                    return fieldUpdate?.arrayItems?.[itemIdx] !== undefined
                                                      ? fieldUpdate.arrayItems[itemIdx]
                                                      : !!item.is_client_requirement;
                                                  })()}
                                                  onCheckedChange={(checked) => handleToggleWebdataFieldArrayItemClientRequirement(automation.id, fieldIndex, itemIdx, !!checked)}
                                                  className="mx-auto"
                                                />
                                              </TableCell>
                                            </TableRow>
                                          ))}
                                        </React.Fragment>
                                      );
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
                    {searchQuery 
                      ? "No matching automations found." 
                      : reqs.length > 0
                        ? "No automations linked to this job level's requirements."
                        : "Select a class/subclass to view linked automations."
                    }
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    )
  }

  // --- RENDER REPORT DOC DEFAULTS HELPER ---
  const classifyDocType = (doc: any): 'individual' | 'company' | 'application' => {
    // Classification based on SettingsPage approach using category field
    const category = (doc.category || '').toLowerCase()
    if (category.includes('company') || category.includes('corporate')) return 'company'
    if (category.includes('director') || category.includes('individual') || category.includes('personal')) return 'individual'
    // Fallback to entity_types if category doesn't match
    const entityTypes = doc.entity_types || []
    if (entityTypes.includes('company')) return 'company'
    if (entityTypes.length > 0) return 'individual'
    return 'application'
  }

  const getDefaultAppliesTo = (doc: any): string[] => {
    const category = (doc.category || '').toLowerCase()
    if (category.includes('company') || category.includes('corporate')) return ['company']
    if (category.includes('director') || category.includes('individual') || category.includes('personal'))
      return ['principal', 'director', 'shareholder', 'dependant', 'employee', 'understudy', 'sponsor']
    const entityTypes = doc.entity_types || []
    if (entityTypes.includes('company')) return ['company']
    if (entityTypes.length > 0) return ['principal', 'director', 'shareholder', 'dependant', 'employee', 'understudy', 'sponsor']
    return ['company', 'principal', 'director', 'shareholder', 'dependant', 'employee', 'understudy', 'sponsor']
  }

  const handleAddReportDoc = async (documentId: string) => {
    if (!editingContext) return
    try {
      setIsSubmitting(true)
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
        .maybeSingle()
      if (fetchError) throw fetchError

      const doc = kycDocuments.find(d => String(d.id) === String(documentId))
      const docType = classifyDocType(doc)
      const currentDefaults = existing?.report_doc_defaults || []
      const newEntry: ReportDocDefault = {
        id: (Date.now()).toString(),
        documentId,
        documentName: doc?.display_name || doc?.name || 'Unknown',
        docType,
        appliesTo: getDefaultAppliesTo(doc),
        order: currentDefaults.length,
        isVisible: true
      }
      const updatedDefaults = [...currentDefaults, newEntry]

      if (existing) {
        const { error: updateError } = await supabase
          .from('tm_class_requirements')
          .update({ report_doc_defaults: updatedDefaults, updated_at: new Date().toISOString() })
          .eq('id', existing.id)
        if (updateError) throw updateError
      } else {
        const { error: insertError } = await supabase
          .from('tm_class_requirements')
          .insert({
            job_level: {
              department_id: Number(editingContext.departmentId),
              subdepartment_id: Number(editingContext.subdepartmentId),
              class_id: editingContext.classId ? Number(editingContext.classId) : null,
              subclass_id: editingContext.subclassId ? Number(editingContext.subclassId) : null,
              level: editingContext.type === 'subdepartment' ? 2 : editingContext.type === 'class' ? 3 : 4
            },
            report_doc_defaults: updatedDefaults,
            created_at: new Date().toISOString()
          })
        if (insertError) throw insertError
      }
      await refreshDepartments()
      toast({ title: "Success", description: "Report doc added" })
    } catch (error) {
      console.error(error)
      toast({ title: "Error", description: "Failed to add report doc", variant: "destructive" })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleRemoveReportDoc = async (docId: string, ctx?: EditingContext) => {
    const contextToUse = ctx || editingContext
    if (!contextToUse) return
    try {
      setIsSubmitting(true)
      const { data: existing, error: fetchError } = await supabase
        .from('tm_class_requirements')
        .select('*')
        .eq('job_level', JSON.stringify({
          department_id: Number(contextToUse.departmentId),
          subdepartment_id: Number(contextToUse.subdepartmentId),
          class_id: contextToUse.classId ? Number(contextToUse.classId) : null,
          subclass_id: contextToUse.subclassId ? Number(contextToUse.subclassId) : null,
          level: contextToUse.type === 'subdepartment' ? 2 : contextToUse.type === 'class' ? 3 : 4
        }))
        .maybeSingle()
      if (fetchError) throw fetchError
      if (!existing) throw new Error('No record found')

      const updatedDefaults = (existing.report_doc_defaults || [])
        .filter((d: ReportDocDefault) => d.id !== docId)
        .map((d: ReportDocDefault, i: number) => ({ ...d, order: i }))

      const { error: updateError } = await supabase
        .from('tm_class_requirements')
        .update({ report_doc_defaults: updatedDefaults, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
      if (updateError) throw updateError
      await refreshDepartments()
      toast({ title: "Success", description: "Report doc removed" })
    } catch (error) {
      console.error(error)
      toast({ title: "Error", description: "Failed to remove report doc", variant: "destructive" })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleToggleReportDocVisibility = async (docId: string, ctx?: EditingContext) => {
    const contextToUse = ctx || editingContext
    if (!contextToUse) return
    const updated = reportDocDefaults.map(d =>
      d.id === docId ? { ...d, isVisible: !d.isVisible } : d
    )
    setReportDocDefaults(updated)
    try {
      const { data: existing } = await supabase
        .from('tm_class_requirements')
        .select('*')
        .eq('job_level', JSON.stringify({
          department_id: Number(contextToUse.departmentId),
          subdepartment_id: Number(contextToUse.subdepartmentId),
          class_id: contextToUse.classId ? Number(contextToUse.classId) : null,
          subclass_id: contextToUse.subclassId ? Number(contextToUse.subclassId) : null,
          level: contextToUse.type === 'subdepartment' ? 2 : contextToUse.type === 'class' ? 3 : 4
        }))
        .maybeSingle()
      if (existing) {
        await supabase
          .from('tm_class_requirements')
          .update({ report_doc_defaults: updated, updated_at: new Date().toISOString() })
          .eq('id', existing.id)
      }
    } catch (error) {
      console.error(error)
    }
  }

  const handleMoveReportDoc = async (index: number, direction: 'up' | 'down', ctx?: EditingContext) => {
    const contextToUse = ctx || editingContext
    if (!contextToUse) return
    const items = [...reportDocDefaults]
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= items.length) return
    ;[items[index], items[targetIndex]] = [items[targetIndex], items[index]]
    const reordered = items.map((d, i) => ({ ...d, order: i }))
    setReportDocDefaults(reordered)
    try {
      const { data: existing } = await supabase
        .from('tm_class_requirements')
        .select('*')
        .eq('job_level', JSON.stringify({
          department_id: Number(contextToUse.departmentId),
          subdepartment_id: Number(contextToUse.subdepartmentId),
          class_id: contextToUse.classId ? Number(contextToUse.classId) : null,
          subclass_id: contextToUse.subclassId ? Number(contextToUse.subclassId) : null,
          level: contextToUse.type === 'subdepartment' ? 2 : contextToUse.type === 'class' ? 3 : 4
        }))
        .maybeSingle()
      if (existing) {
        await supabase
          .from('tm_class_requirements')
          .update({ report_doc_defaults: reordered, updated_at: new Date().toISOString() })
          .eq('id', existing.id)
      }
    } catch (error) {
      console.error(error)
    }
  }

  const handleToggleReportDocAppliesTo = async (docId: string, entityType: string, ctx?: EditingContext) => {
    const contextToUse = ctx || editingContext
    if (!contextToUse) return
    const updated = reportDocDefaults.map(d => {
      if (d.id !== docId) return d
      const current = d.appliesTo || []
      const next = current.includes(entityType)
        ? current.filter((v: string) => v !== entityType)
        : [...current, entityType]
      return { ...d, appliesTo: next }
    })
    setReportDocDefaults(updated)
    try {
      const { data: existing } = await supabase
        .from('tm_class_requirements')
        .select('*')
        .eq('job_level', JSON.stringify({
          department_id: Number(contextToUse.departmentId),
          subdepartment_id: Number(contextToUse.subdepartmentId),
          class_id: contextToUse.classId ? Number(contextToUse.classId) : null,
          subclass_id: contextToUse.subclassId ? Number(contextToUse.subclassId) : null,
          level: contextToUse.type === 'subdepartment' ? 2 : contextToUse.type === 'class' ? 3 : 4
        }))
        .maybeSingle()
      if (existing) {
        await supabase
          .from('tm_class_requirements')
          .update({ report_doc_defaults: updated, updated_at: new Date().toISOString() })
          .eq('id', existing.id)
      }
    } catch (error) {
      console.error(error)
    }
  }

  const handleEditReportDoc = (doc: any, ctx: EditingContext) => {
    setEditingContext(ctx)
    setEditingReportDoc({ ...doc, category: 'report-docs' })
    setIsEditReportDocDialogOpen(true)
  }

  const handleSaveReportDoc = async (updatedDoc: any) => {
    const contextToUse = editingContext
    if (!contextToUse) return
    try {
      setIsSubmitting(true)
      const { data: existing } = await supabase
        .from('tm_class_requirements')
        .select('*')
        .eq('job_level', JSON.stringify({
          department_id: Number(contextToUse.departmentId),
          subdepartment_id: Number(contextToUse.subdepartmentId),
          class_id: contextToUse.classId ? Number(contextToUse.classId) : null,
          subclass_id: contextToUse.subclassId ? Number(contextToUse.subclassId) : null,
          level: contextToUse.type === 'subdepartment' ? 2 : contextToUse.type === 'class' ? 3 : 4
        }))
        .maybeSingle()
      if (!existing) throw new Error('No record found')

      const updatedDefaults = (existing.report_doc_defaults || []).map((d: any) =>
        d.id === updatedDoc.id ? { ...d, ...updatedDoc, category: undefined } : d
      )
      const { error } = await supabase
        .from('tm_class_requirements')
        .update({ report_doc_defaults: updatedDefaults, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
      if (error) throw error
      setReportDocDefaults(updatedDefaults)
      setIsEditReportDocDialogOpen(false)
      setEditingReportDoc(null)
      toast({ title: "Success", description: "Report document updated" })
    } catch (error) {
      console.error(error)
      toast({ title: "Error", description: "Failed to update report document", variant: "destructive" })
    } finally {
      setIsSubmitting(false)
    }
  }

  const renderReportDocDefaults = (context: EditingContext) => {
    const groupedDocs = {
      individual: reportDocDefaults.filter(d => d.docType === 'individual').sort((a, b) => a.order - b.order),
      company: reportDocDefaults.filter(d => d.docType === 'company').sort((a, b) => a.order - b.order),
      application: reportDocDefaults.filter(d => d.docType === 'application').sort((a, b) => a.order - b.order)
    }

    const getDocTypeBadge = (docType: string) => {
      switch (docType) {
        case 'individual':
          return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-[10px]">Individual</Badge>
        case 'company':
          return <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200 text-[10px]">Company</Badge>
        case 'application':
          return <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]">Application</Badge>
        default:
          return <Badge variant="outline" className="text-[10px]">Unknown</Badge>
      }
    }

    return (
      <div className="border rounded-lg overflow-hidden bg-white shadow-sm">
        <div className="overflow-auto max-h-[600px]">
          <Table>
            <TableHeader className="bg-slate-50 sticky top-0 z-10">
              <TableRow>
                <TableHead className="w-12 text-center border-r">#</TableHead>
                <TableHead className="min-w-[200px] border-r">Document Name</TableHead>
                <TableHead className="border-r">Doc Type</TableHead>
                <TableHead className="border-r min-w-[280px]">Applies To</TableHead>
                <TableHead className="border-r text-center">Ordering</TableHead>
                <TableHead className="border-r text-center">Visible</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reportDocDefaults.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground italic bg-slate-50/30">
                    No report documents configured. Add KYC documents to display by default in reports.
                  </TableCell>
                </TableRow>
              ) : (
                Object.entries(groupedDocs).map(([groupKey, docs]) => (
                  <React.Fragment key={groupKey}>
                    {docs.length > 0 && (
                      <TableRow className="bg-slate-100/80 border-y">
                        <TableCell colSpan={7} className="py-2 px-4 font-bold text-xs uppercase text-slate-500">
                          {groupKey === 'individual' ? 'Individual Documents' :
                           groupKey === 'company' ? 'Company Documents' : 'Application Documents'}
                          <span className="text-slate-400 font-normal ml-2">({docs.length})</span>
                        </TableCell>
                      </TableRow>
                    )}
                    {docs.map((doc, idx) => (
                      <TableRow key={doc.id} className="hover:bg-slate-50/50">
                        <TableCell className="text-center font-mono text-xs text-muted-foreground border-r">
                          {doc.order + 1}
                        </TableCell>
                        <TableCell className="border-r font-medium text-sm">
                          {doc.documentName || 'Unknown Document'}
                        </TableCell>
                        <TableCell className="border-r">{getDocTypeBadge(doc.docType)}</TableCell>
                        <TableCell className="border-r">
                          <div className="flex flex-wrap gap-1">
                            {(['company', 'principal', 'director', 'shareholder', 'dependant', 'employee', 'understudy', 'sponsor'] as const).map(et => {
                              const isSelected = (doc.appliesTo || []).includes(et)
                              return (
                                <button
                                  key={et}
                                  type="button"
                                  className={cn(
                                    "text-[9px] px-1.5 py-0.5 rounded-full border transition-all font-medium capitalize",
                                    isSelected
                                      ? "bg-emerald-100 text-emerald-700 border-emerald-300"
                                      : "bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100"
                                  )}
                                  onClick={() => handleToggleReportDocAppliesTo(doc.id, et, context)}
                                >
                                  {et}
                                </button>
                              )
                            })}
                          </div>
                        </TableCell>
                        <TableCell className="border-r text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              variant="ghost" size="icon" className="h-7 w-7 text-slate-400"
                              disabled={doc.order <= 0 || isSubmitting}
                              onClick={() => handleMoveReportDoc(reportDocDefaults.indexOf(doc), 'up', context)}
                            >
                              <ArrowUp className="h-3.5 w-3.5" />
                            </Button>
                            <span className="text-xs font-mono text-slate-500 w-6 text-center">{doc.order + 1}</span>
                            <Button
                              variant="ghost" size="icon" className="h-7 w-7 text-slate-400"
                              disabled={doc.order >= reportDocDefaults.length - 1 || isSubmitting}
                              onClick={() => handleMoveReportDoc(reportDocDefaults.indexOf(doc), 'down', context)}
                            >
                              <ArrowDown className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell className="border-r text-center">
                          <Button
                            variant="ghost" size="icon" className="h-7 w-7 mx-auto"
                            onClick={() => handleToggleReportDocVisibility(doc.id, context)}
                          >
                            {doc.isVisible ? (
                              <Eye className="h-4 w-4 text-emerald-600" />
                            ) : (
                              <EyeOff className="h-4 w-4 text-slate-400" />
                            )}
                          </Button>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-blue-600"
                              onClick={() => handleEditReportDoc(doc, context)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500"
                              onClick={() => {
                                setRemovingReportDocId(doc.id)
                                setIsRemoveReportDocConfirmOpen(true)
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </React.Fragment>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        {/* Info message - users should use the Add button to add report docs */}
        <div className="p-3 border-t bg-slate-50/50">
          <div className="flex items-center justify-center gap-2 text-sm text-slate-500">
            <FileText className="h-4 w-4 text-emerald-500" />
            <span>Use the <strong className="text-emerald-600">+</strong> button above to add report documents via the Configuration Manager.</span>
          </div>
        </div>
      </div>
    )
  }

  const renderRequirements = (requirementsToRender: RequirementTableEntry[], context: EditingContext) => {
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
                <TableHead className="w-16 text-center border-r">
                  {(() => {
                    const total = requirementsToRender.length;
                    const checked = requirementsToRender.filter(r => (r.id || '') in pendingRequirementClientReqs ? pendingRequirementClientReqs[r.id || ''] : !!r.is_client_requirement).length;
                    const allChecked = total > 0 && checked === total;
                    const someChecked = total > 0 && checked > 0 && checked < total;
                    return (
                      <div className="flex flex-col items-center gap-0.5">
                        <span className="text-[10px] font-normal leading-none">Client Req.</span>
                        <Checkbox
                          checked={allChecked}
                          ref={(el) => { if (el) el.dataset.state = someChecked ? 'indeterminate' : (allChecked ? 'checked' : 'unchecked'); }}
                          onCheckedChange={(c) => handleToggleAllRequirementsClientRequirement(!!c, requirementsToRender)}
                          className="mx-auto"
                        />
                      </div>
                    );
                  })()}
                </TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requirementsToRender.length > 0 ? (
                requirementsToRender.map((req, idx) => {
                  const hasWebData = req.webdata && req.webdata.length > 0;
                  const matchesSearch = searchQuery && req.webdata?.some((wd: any) =>
                    wd.variableName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    wd.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    wd.efnsDisplayName?.toLowerCase().includes(searchQuery.toLowerCase())
                  );
                  const isExpanded = expandedWebDataRows.has(req.id || `temp-${idx}`) || !!matchesSearch;
                  const absoluteIndex = activeSelection.reqs.findIndex(item => item.id === req.id);

                  return (
                    <React.Fragment key={req.id || idx}>
                      <TableRow className={cn("hover:bg-slate-50/50", isExpanded && "bg-slate-50 border-b-0")}>
                        <TableCell className="text-center font-mono text-xs text-muted-foreground border-r">{idx + 1}</TableCell>
                        <TableCell className="border-r">
                          <div className="font-medium">
                            <HighlightText text={req.name} highlight={searchQuery} />
                          </div>
                          {req.description && (
                            <div className="text-xs text-muted-foreground line-clamp-1">
                              <HighlightText text={req.description} highlight={searchQuery} />
                            </div>
                          )}
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
                            checked={(req.id || '') in pendingRequirementClientReqs ? pendingRequirementClientReqs[req.id || ''] : !!req.is_client_requirement}
                            disabled={isSubmitting}
                            onCheckedChange={(checked) => handleToggleClientRequirement(req, context, !!checked)}
                            className="mx-auto"
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost" size="icon" className="h-8 w-8 text-slate-400"
                              disabled={absoluteIndex <= 0 || isSubmitting}
                              onClick={() => handleMoveItem('requirement', absoluteIndex, 'up', context)}
                            >
                              <ArrowUp className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost" size="icon" className="h-8 w-8 text-slate-400"
                              disabled={absoluteIndex === -1 || absoluteIndex === activeSelection.reqs.length - 1 || isSubmitting}
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
                                    {req.webdata.map((field, i) => (
                                      <TableRow key={i} className="hover:bg-slate-50/50">
                                        <TableCell className="py-2 text-xs font-mono text-blue-600">
                                          <HighlightText text={field.variableName} highlight={searchQuery} />
                                        </TableCell>
                                        <TableCell className="py-2 text-xs font-medium">
                                          <HighlightText text={field.efnsDisplayName || field.name} highlight={searchQuery} />
                                        </TableCell>
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
                  <TableCell colSpan={12} className="text-center py-8 text-muted-foreground italic bg-slate-50/30">
                    {searchQuery ? "No matching requirements found." : "No requirements found in this section."}
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
        if (payload.report_doc_defaults) updateData.report_doc_defaults = payload.report_doc_defaults;

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
    setPendingRequirementClientReqs(prev => ({ ...prev, [req.id || '']: checked }));
  };

  const handleToggleQuestionClientRequirement = async (question: JobQuestion, context: EditingContext, checked: boolean) => {
    setPendingQuestionClientReqs(prev => ({ ...prev, [question.id]: checked }));
  };

  const toggleAutomationConfigRow = (automationId: string) => {
    setExpandedAutomationConfig(prev => {
      const next = new Set(prev);
      if (next.has(automationId)) next.delete(automationId); else next.add(automationId);
      return next;
    });
  };

  const handleToggleWebdataFieldClientRequirement = async (automationId: string, fieldIndex: number, checked: boolean) => {
    setPendingWebdataClientReqs(prev => {
      const auto = prev[automationId] || {};
      const existing = auto[fieldIndex] || { value: false, arrayItems: {} };
      return { ...prev, [automationId]: { ...auto, [fieldIndex]: { ...existing, value: checked } } };
    });
  };

  const handleToggleWebdataFieldArrayItemClientRequirement = async (automationId: string, fieldIndex: number, itemIndex: number, checked: boolean) => {
    setPendingWebdataClientReqs(prev => {
      const auto = prev[automationId] || {};
      const existing = auto[fieldIndex] || { value: false, arrayItems: {} };
      return { ...prev, [automationId]: { ...auto, [fieldIndex]: { ...existing, arrayItems: { ...(existing.arrayItems || {}), [itemIndex]: checked } } } };
    });
  };

  // --- Select All / Deselect All Handlers (local state only) ---
  const handleToggleAllQuestionsClientRequirement = async (checked: boolean, list: JobQuestion[]) => {
    const updates: Record<string, boolean> = { ...pendingQuestionClientReqs };
    list.forEach(q => { updates[q.id] = checked; });
    setPendingQuestionClientReqs(updates);
  };

  const handleToggleAllRequirementsClientRequirement = async (checked: boolean, list: RequirementTableEntry[]) => {
    const updates: Record<string, boolean> = { ...pendingRequirementClientReqs };
    list.forEach(r => { updates[r.id || ''] = checked; });
    setPendingRequirementClientReqs(updates);
  };

  const handleToggleAllWebdataFieldsClientRequirement = async (automationId: string, checked: boolean) => {
    const automation = allAutomations.find(a => a.id === automationId);
    if (!automation) return;
    const fieldsUpdate: Record<number, { value: boolean; arrayItems?: Record<number, boolean> }> = {};
    automation.webdata.forEach((f, i) => {
      if (f.fieldType === 'array' && f.arrayItems) {
        const itemsUpdate: Record<number, boolean> = {};
        f.arrayItems.forEach((_, j) => { itemsUpdate[j] = checked; });
        fieldsUpdate[i] = { value: checked, arrayItems: itemsUpdate };
      } else {
        fieldsUpdate[i] = { value: checked };
      }
    });
    setPendingWebdataClientReqs(prev => ({ ...prev, [automationId]: fieldsUpdate }));
  };

  // --- Batch Submit for Client Requirements ---
  const hasPendingClientReqs = useMemo(() => {
    return Object.keys(pendingQuestionClientReqs).length > 0
      || Object.keys(pendingRequirementClientReqs).length > 0
      || Object.keys(pendingWebdataClientReqs).length > 0;
  }, [pendingQuestionClientReqs, pendingRequirementClientReqs, pendingWebdataClientReqs]);

  const handleSubmitClientReqs = async () => {
    const currentDeptId = activeDept;
    const currentSubdeptId = activeSubdept[String(currentDeptId)];
    if (!currentDeptId || !currentSubdeptId) return;
    const activeClassKey = `${String(currentDeptId)}-${String(currentSubdeptId)}`;
    const currentClassId = activeClass[activeClassKey];
    const activeSubclassKey = `${activeClassKey}-${String(currentClassId)}`;
    const currentSubclassId = activeSubclass[activeSubclassKey];
    const level = currentSubclassId ? 4 : currentClassId ? 3 : 2;

    const jobLevel = {
      department_id: Number(currentDeptId),
      subdepartment_id: Number(currentSubdeptId),
      class_id: currentClassId ? Number(currentClassId) : null,
      subclass_id: currentSubclassId ? Number(currentSubclassId) : null,
      level,
    };

    try {
      setIsSubmitting(true);

      // 1. Save questions and requirements to tm_class_requirements
      const { data: existing, error: fetchError } = await supabase
        .from('tm_class_requirements')
        .select('*')
        .eq('job_level', JSON.stringify(jobLevel))
        .maybeSingle();
      if (fetchError) throw fetchError;

      if (existing) {
        const updatePayload: any = { updated_at: new Date().toISOString() };

        // Questions
        if (Object.keys(pendingQuestionClientReqs).length > 0) {
          const updatedQuestions = (existing.job_specific_questions || []).map((q: any) => {
            if (q.id in pendingQuestionClientReqs) {
              return { ...q, is_client_requirement: pendingQuestionClientReqs[q.id] };
            }
            return q;
          });
          updatePayload.job_specific_questions = updatedQuestions;
        }

        // Requirements
        if (Object.keys(pendingRequirementClientReqs).length > 0) {
          const updatedReqs = (existing.requirements || []).map((r: any) => {
            const key = r.id || '';
            if (key in pendingRequirementClientReqs) {
              return { ...r, is_client_requirement: pendingRequirementClientReqs[key] };
            }
            return r;
          });
          updatePayload.requirements = updatedReqs;
        }

        const { error: updateError } = await supabase
          .from('tm_class_requirements')
          .update(updatePayload)
          .eq('id', existing.id);
        if (updateError) throw updateError;
      }

      // 2. Save webdata field changes to tm_automations (concurrent via Promise.all)
      const automationUpdates = Object.entries(pendingWebdataClientReqs).map(async ([automationId, fieldsUpdate]) => {
        const automation = allAutomations.find(a => a.id === automationId);
        if (!automation) return;
        const updatedWebdata = automation.webdata.map((f, i) => {
          const fieldUpdate = fieldsUpdate[i];
          if (!fieldUpdate) return f;
          if (f.fieldType === 'array' && f.arrayItems && fieldUpdate.arrayItems) {
            const updatedItems = f.arrayItems.map((item, j) => {
              if (j in fieldUpdate.arrayItems!) {
                return { ...item, is_client_requirement: fieldUpdate.arrayItems![j] };
              }
              return item;
            });
            return { ...f, is_client_requirement: fieldUpdate.value, arrayItems: updatedItems };
          }
          return { ...f, is_client_requirement: fieldUpdate.value };
        });
        const { error } = await supabase
          .from('tm_automations')
          .update({ webdata: updatedWebdata, updated_at: new Date().toISOString() })
          .eq('id', automationId);
        if (error) throw error;
        setAllAutomations(prev => prev.map(a => a.id === automationId ? { ...a, webdata: updatedWebdata } : a));
      });
      await Promise.all(automationUpdates);

      // 3. Clear pending state and refresh
      setPendingQuestionClientReqs({});
      setPendingRequirementClientReqs({});
      setPendingWebdataClientReqs({});
      await refreshDepartments();
      toast({ title: "Success", description: "Client requirements updated successfully" });
    } catch (error) {
      console.error(error);
      toast({ title: "Error", description: "Failed to update client requirements", variant: "destructive" });
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
    <div className="h-screen w-full overflow-hidden bg-background">
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
          <main className="h-full flex flex-col overflow-hidden">
            <div className="h-full overflow-auto p-4 pb-20 space-y-4">
              <header className="flex items-center justify-between">
                <div>
                  <h2 className="text-3xl font-bold tracking-tight">Requirement Logic Manager</h2>
                </div>
                {activeDept && (
                  <div className="relative w-80">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="search"
                      placeholder="Search all sections..."
                      className="pl-9 bg-white"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                )}
              </header>
              {!activeDept ? (
                <Card className="p-20 text-center">
                  <FileText className="mx-auto h-12 w-12 text-slate-300 mb-4" />
                  <p>Select a department to manage logic.</p>
                </Card>
              ) : (
                <Tabs value={activeMainTab} onValueChange={setActiveMainTab} className="w-full">
                  <TabsList className="w-full justify-start h-auto bg-transparent border-b p-0 gap-0 mb-4">
                    <TabsTrigger
                      value="logic"
                      className="rounded-t-lg rounded-b-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:bg-white data-[state=active]:shadow-none px-5 py-2.5 text-sm font-medium"
                    >
                      <Layers className="h-4 w-4 mr-2" />
                      Requirement Logic
                    </TabsTrigger>
                    <TabsTrigger
                      value="checklist"
                      className="rounded-t-lg rounded-b-none border-b-2 border-transparent data-[state=active]:border-emerald-600 data-[state=active]:bg-white data-[state=active]:shadow-none px-5 py-2.5 text-sm font-medium"
                    >
                      <FileText className="h-4 w-4 mr-2" />
                      Requirement Checklist
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="logic" className="mt-0">
                    {renderMainContent()}
                  </TabsContent>
                  <TabsContent value="checklist" className="mt-0">
                    {renderChecklist()}
                  </TabsContent>
                </Tabs>
              )}

              {/* Floating Submit Bar for Client Requirement Changes */}
              {hasPendingClientReqs && (
                <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t shadow-lg">
                  <div className="flex items-center justify-between px-6 py-3 max-w-screen-2xl mx-auto">
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                      <span>
                        You have unsaved client requirement changes
                        {Object.keys(pendingQuestionClientReqs).length > 0 && (
                          <span className="ml-1 text-slate-400">({Object.keys(pendingQuestionClientReqs).length} question{Object.keys(pendingQuestionClientReqs).length !== 1 ? 's' : ''})</span>
                        )}
                        {Object.keys(pendingRequirementClientReqs).length > 0 && (
                          <span className="ml-1 text-slate-400">({Object.keys(pendingRequirementClientReqs).length} requirement{Object.keys(pendingRequirementClientReqs).length !== 1 ? 's' : ''})</span>
                        )}
                        {Object.keys(pendingWebdataClientReqs).length > 0 && (
                          <span className="ml-1 text-slate-400">({Object.keys(pendingWebdataClientReqs).length} automation{Object.keys(pendingWebdataClientReqs).length !== 1 ? 's' : ''})</span>
                        )}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setPendingQuestionClientReqs({});
                          setPendingRequirementClientReqs({});
                          setPendingWebdataClientReqs({});
                        }}
                      >
                        <X className="h-4 w-4 mr-1" />
                        Discard
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleSubmitClientReqs}
                        disabled={isSubmitting}
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                      >
                        {isSubmitting ? (
                          <span className="flex items-center gap-1">
                            <span className="h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            Saving...
                          </span>
                        ) : (
                          <>
                            <Check className="h-4 w-4 mr-1" />
                            Submit Changes
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              <AddRequirementsDialog isOpen={isAddDialogOpen} onOpenChange={setIsAddDialogOpen} onSubmit={handleAddRequirements} isSubmitting={isSubmitting} context={addContext} />
              <EditRequirementDialog isOpen={isEditDialogOpen} onOpenChange={setIsEditDialogOpen} requirement={editingRequirement} onSave={handleSaveRequirement} isSubmitting={isSubmitting} context={editingContext} />
              <EditRequirementDialog isOpen={isEditReportDocDialogOpen} onOpenChange={setIsEditReportDocDialogOpen} requirement={editingReportDoc} onSave={handleSaveReportDoc} isSubmitting={isSubmitting} context={editingContext} />

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

              <DeleteConfirmationDialog
                open={isRemoveReportDocConfirmOpen}
                onOpenChange={setIsRemoveReportDocConfirmOpen}
                onConfirm={() => {
                  if (removingReportDocId) {
                    handleRemoveReportDoc(removingReportDocId)
                  }
                  setIsRemoveReportDocConfirmOpen(false)
                  setRemovingReportDocId(null)
                }}
                title="Remove Report Document"
                description="Are you sure you want to remove this document from report documents? This action cannot be undone."
                confirmText="Remove"
              />
            </div>
          </main>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  )
}