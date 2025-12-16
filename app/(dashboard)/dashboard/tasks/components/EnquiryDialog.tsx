// @ts-nocheck
"use client"

import { useState, useCallback, useMemo, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Check, ChevronsUpDown, Loader2, User, Users, Building2, FileText, UserPlus, UserCheck, Shield } from "lucide-react"
import { cn } from "@/lib/utils"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from "@/components/ui/command"
import { Textarea } from "@/components/ui/textarea"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { supabase } from "@/lib/supabase/client"
import { toast } from "@/hooks/use-toast"
import { format } from "date-fns"

// --- Types ---
interface Individual {
    id: number
    full_name: string
    first_name?: string
    last_name?: string
    contact_details?: {
        phone?: { kenyan?: { primary?: string } }
        email?: { primary?: string }
    }
    individual_type: 'principal' | 'dependant'
    relationships?: Array<{
        individual_id: number
        relationship: string
        isPrincipal?: string
        related_individual?: { id: number; full_name: string }
    }>
    employment_data?: any
}

interface FormData {
    full_name: string
    mobile_number: string
    job_description: string
    department_id: string
    subdepartment_id: string
    class_id: string
    subclass_id: string
    department_name: string
    subdepartment_name: string
    class_name: string
    principal_member_id: string
    officer_id: string
    task_manager_id: string
    task_assistant_id: string
    enquiry_date: string
    job_level: number | null
}

const INITIAL_FORM_DATA: FormData = {
    full_name: '',
    mobile_number: '',
    job_description: '',
    department_id: '',
    subdepartment_id: '',
    class_id: '',
    subclass_id: '',
    department_name: '',
    subdepartment_name: '',
    class_name: '',
    principal_member_id: '',
    officer_id: '',
    task_manager_id: '',
    task_assistant_id: '',
    enquiry_date: new Date().toISOString().split('T')[0],
    job_level: null
}

export function EnquiryDialog({
    open,
    onOpenChange,
    onEnquiryCreated,
    departments = [],
    users = [],
    officers = []
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    onEnquiryCreated: (enquiry: any) => void
    departments: any[]
    users: any[]
    officers: any[]
}) {
    // --- State ---
    const [loading, setLoading] = useState(false)
    const [searchLoading, setSearchLoading] = useState(false)
    const [loadingCompanies, setLoadingCompanies] = useState(false)
    const [loadingStaff, setLoadingStaff] = useState(false)

    // Data Lists
    const [localUsers, setLocalUsers] = useState<any[]>(users)
    const [localOfficers, setLocalOfficers] = useState<any[]>(officers)
    const [individuals, setIndividuals] = useState<Individual[]>([])

    // Selection State
    const [applicantType, setApplicantType] = useState<'principal' | 'dependant'>('principal')
    const [selectedIndividual, setSelectedIndividual] = useState<Individual | null>(null)
    const [principalForDependant, setPrincipalForDependant] = useState<Individual | null>(null)

    // Related Entities
    const [companies, setCompanies] = useState<any[]>([])
    const [selectedCompany, setSelectedCompany] = useState<string>('')
    const [understudies, setUnderstudies] = useState<any[]>([])
    const [selectedUnderstudy, setSelectedUnderstudy] = useState<string>('')

    // Checkboxes & Multi-select
    const [includeDependants, setIncludeDependants] = useState(false)
    const [availableDependants, setAvailableDependants] = useState<Individual[]>([])
    const [selectedDependants, setSelectedDependants] = useState<string[]>([])

    const [includeReferences, setIncludeReferences] = useState(false)
    const [availableReferences, setAvailableReferences] = useState<Individual[]>([])
    const [selectedReferences, setSelectedReferences] = useState<string[]>([])

    const [taskType, setTaskType] = useState<'new' | 'renewal'>('new')
    const [isIndividualPopoverOpen, setIsIndividualPopoverOpen] = useState(false)
    const [formData, setFormData] = useState<FormData>(INITIAL_FORM_DATA)

    // --- Derived State (Memoized) ---
    // Instead of using effects to set these, we calculate them during render

    const availableSubdepartments = useMemo(() => {
        if (!formData.department_id) return []
        const dept = departments.find(d => d.id.toString() === formData.department_id)
        return dept?.tm_subdepartments || []
    }, [formData.department_id, departments])

    const availableClasses = useMemo(() => {
        if (!formData.subdepartment_id) return []
        const subdept = availableSubdepartments.find(s => s.id.toString() === formData.subdepartment_id)
        return subdept?.classes || []
    }, [availableSubdepartments, formData.subdepartment_id])

    const availableSubclasses = useMemo(() => {
        if (!formData.class_id) return []
        const cls = availableClasses.find(c => c.id.toString() === formData.class_id)
        return cls?.subClasses || []
    }, [availableClasses, formData.class_id])

    // Derived Staff Lists based on Subdepartment History
    const { availableOfficers, availableManagers } = useMemo(() => {
        if (!formData.subdepartment_id || !localUsers.length) {
            return { availableOfficers: [], availableManagers: [] }
        }

        const subdept = availableSubdepartments.find(s => s.id.toString() === formData.subdepartment_id)
        if (!subdept) return { availableOfficers: localOfficers, availableManagers: localUsers }

        const getActiveIds = (history: any[]) => history?.filter(h => !h.end_date).map(h => h.id) || []

        const activeOfficerIds = getActiveIds(subdept.officer_history)
        const activeManagerIds = getActiveIds(subdept.manager_history)

        // If no history exists, return all
        if (!activeOfficerIds.length && !activeManagerIds.length) {
            return {
                availableOfficers: localOfficers,
                availableManagers: localUsers.filter(u => ['user', 'admin'].includes(u.role))
            }
        }

        return {
            availableOfficers: activeOfficerIds.length
                ? localOfficers.filter(o => activeOfficerIds.includes(o.id))
                : localOfficers,
            availableManagers: activeManagerIds.length
                ? localUsers.filter(u => activeManagerIds.includes(u.id))
                : localUsers.filter(u => ['user', 'admin'].includes(u.role))
        }
    }, [formData.subdepartment_id, availableSubdepartments, localUsers, localOfficers])

    // Derived Assistants based on selected Manager
    const availableAssistants = useMemo(() => {
        if (!formData.task_manager_id || !formData.subdepartment_id) return []

        const subdept = availableSubdepartments.find(s => s.id.toString() === formData.subdepartment_id)
        if (!subdept?.assistant_history) return localUsers.filter(u => u.role === 'user')

        const assistantIds = subdept.assistant_history
            .filter(h => !h.end_date && h.manager_id?.toString() === formData.task_manager_id)
            .map(h => h.id)

        return assistantIds.length > 0
            ? localUsers.filter(u => assistantIds.includes(u.id))
            : []
    }, [formData.task_manager_id, formData.subdepartment_id, availableSubdepartments, localUsers])


    // --- Handlers ---

    // Unified Field Change Handler
    const updateForm = useCallback((updates: Partial<FormData>) => {
        setFormData(prev => ({ ...prev, ...updates }))
    }, [])

    // Hierarchy Handlers with Auto-Reset
    const handleDepartmentChange = useCallback((deptId: string) => {
        const dept = departments.find(d => d.id.toString() === deptId)
        if (!dept) return

        // Auto-select subdepartment if only one exists
        const subDepts = dept.tm_subdepartments || []
        const autoSub = subDepts.length === 1 ? subDepts[0] : null

        setFormData(prev => ({
            ...prev,
            department_id: deptId,
            department_name: dept.name,
            subdepartment_id: autoSub ? autoSub.id.toString() : '',
            subdepartment_name: autoSub ? autoSub.name : '',
            class_id: '', class_name: '', subclass_id: '', officer_id: '', task_manager_id: '', task_assistant_id: ''
        }))
    }, [departments])

    const handleSubDepartmentChange = useCallback((subId: string) => {
        const sub = availableSubdepartments.find(s => s.id.toString() === subId)
        if (!sub) return

        const classes = sub.classes || []
        const autoClass = classes.length === 1 ? classes[0] : null

        setFormData(prev => ({
            ...prev,
            subdepartment_id: subId,
            subdepartment_name: sub.name,
            class_id: autoClass ? autoClass.id.toString() : '',
            class_name: autoClass ? autoClass.name : '',
            subclass_id: '', officer_id: '', task_manager_id: '', task_assistant_id: ''
        }))
    }, [availableSubdepartments])

    const handleClassChange = useCallback((classId: string) => {
        const cls = availableClasses.find(c => c.id.toString() === classId)
        if (!cls) return

        const subClasses = cls.subClasses || []
        const autoSubClass = subClasses.length === 1 ? subClasses[0] : null

        setFormData(prev => ({
            ...prev,
            class_id: classId,
            class_name: cls.name,
            subclass_id: autoSubClass ? autoSubClass.id.toString() : '',
            subclass_name: autoSubClass ? autoSubClass.name : ''
        }))
    }, [availableClasses])

    // --- Async Data Fetchers ---

    const fetchUnderstudies = useCallback(async (companyId: string) => {
        if (!companyId) {
            setUnderstudies([]); setSelectedUnderstudy(''); return
        }

        try {
            const { data: companyData } = await supabase
                .from('acc_portal_company_duplicate')
                .select('understudy')
                .eq('id', companyId)
                .single()

            const understudyList = companyData?.understudy || []
            if (!understudyList.length) {
                setUnderstudies([]); return
            }

            const { data: individuals } = await supabase
                .from('registry_individuals')
                .select('id, full_name')
                .in('id', understudyList.map((u: any) => u.individual_id))

            setUnderstudies(individuals || [])
        } catch (error) {
            console.error("Failed to load understudies", error)
        }
    }, [])

    const handleCompanyChange = useCallback((value: string) => {
        setSelectedCompany(value)
        fetchUnderstudies(value)
    }, [fetchUnderstudies])

    const fetchRelatedData = useCallback(async (individual: Individual) => {
        try {
            // 1. Fetch References
            const { data: refData } = await supabase
                .from('registry_individuals')
                .select('references')
                .eq('id', individual.id)
                .single()

            if (refData?.references?.length) {
                const refIds = refData.references.map((r: any) => r.id).filter(Boolean)
                const { data: refs } = await supabase
                    .from('registry_individuals')
                    .select('id, full_name')
                    .in('id', refIds)

                setAvailableReferences(refs?.map(r => ({ ...r, relationship_type: 'Reference' })) || [])
            }

            // 2. Fetch Companies (If Principal)
            if (individual.individual_type === 'principal') {
                setLoadingCompanies(true)
                const empData = individual.employment_data?.associations || []
                const validAssocs = empData.filter((a: any) => a.individual_type === 'Principal' && a.company_id)

                if (validAssocs.length) {
                    const ids = [...new Set(validAssocs.map((a: any) => a.company_id))]
                    const { data: comps } = await supabase
                        .from('acc_portal_company_duplicate')
                        .select('id, company_name, understudy')
                        .in('id', ids)

                    // Enhance company data with "Current" / "Bill To" flags
                    const enhancedComps = (comps || []).map(c => {
                        const assoc = validAssocs.find((a: any) => a.company_id.toString() === c.id.toString())
                        return {
                            ...c,
                            is_current: assoc?.is_current,
                            is_bill_to: assoc?.is_current // Simplification based on logic
                        }
                    })

                    setCompanies(enhancedComps)

                    // Auto-select company logic
                    if (enhancedComps.length === 1) handleCompanyChange(enhancedComps[0].id.toString())
                    else {
                        const current = enhancedComps.find(c => c.is_current)
                        if (current) handleCompanyChange(current.id.toString())
                    }
                }
                setLoadingCompanies(false)
            }
        } catch (error) {
            console.error(error)
        }
    }, [handleCompanyChange])

    const handleIndividualSelect = useCallback(async (ind: Individual) => {
        // Reset Related State
        setSelectedIndividual(ind)
        setCompanies([]); setSelectedCompany('')
        setUnderstudies([]); setSelectedUnderstudy('')
        setAvailableDependants([]); setSelectedDependants([]); setIncludeDependants(false)
        setAvailableReferences([]); setSelectedReferences([]); setIncludeReferences(false)
        setPrincipalForDependant(null)

        updateForm({
            full_name: ind.full_name,
            mobile_number: ind.contact_details?.phone?.kenyan?.primary || '',
            principal_member_id: ''
        })

        // Fetch References & Companies
        await fetchRelatedData(ind)

        // Handle Dependants / Principal Relationship
        if (ind.individual_type === 'principal') {
            // Load family
            if (ind.relationships) {
                const familyIds = ind.relationships.map(r => r.individual_id).filter(id => id !== ind.id)
                if (familyIds.length) {
                    const { data: family } = await supabase
                        .from('registry_individuals')
                        .select('id, full_name')
                        .in('id', familyIds)

                    const familyWithRel = (family || []).map(f => {
                        const rel = ind.relationships?.find(r => r.individual_id === f.id)
                        return { ...f, relationship_type: rel?.relationship || 'Family' }
                    })
                    setAvailableDependants(familyWithRel)
                }
            }
        } else {
            // It's a Dependant - Find Principal
            const principalRel = ind.relationships?.find((r: any) =>
                r.isPrincipal === 'Yes' ||
                ['principal', 'spouse', 'husband', 'wife', 'father', 'mother'].includes(r.relationship?.toLowerCase())
            )

            if (principalRel?.individual_id) {
                const { data: principal } = await supabase
                    .from('registry_individuals')
                    .select('id, full_name, employment_data')
                    .eq('id', principalRel.individual_id)
                    .single()

                if (principal) {
                    setPrincipalForDependant(principal)
                    updateForm({ principal_member_id: principal.id.toString() })

                    // Allow selecting principal as "family" for the dependant
                    setAvailableDependants([{ ...principal, relationship_type: 'Principal Member' }])
                    setIncludeDependants(true)
                    setSelectedDependants([principal.id.toString()])

                    // Load Principal's companies
                    await fetchRelatedData({ ...principal, individual_type: 'principal' } as Individual)
                }
            }
        }
    }, [updateForm, fetchRelatedData])

    // --- Search & Init ---

    useEffect(() => {
        if (open) {
            // Reset form on open
            setFormData(INITIAL_FORM_DATA)
            setApplicantType('principal')
            setSelectedIndividual(null)

            // Lazy load individuals
            setSearchLoading(true)
            supabase.from('registry_individuals')
                .select('id, full_name, first_name, last_name, contact_details, individual_type, relationships, employment_data')
                .eq('individual_type', 'principal') // Default to principal first
                .order('full_name')
                .then(({ data }) => {
                    setIndividuals(data || [])
                    setSearchLoading(false)
                })

            // Lazy load staff if not provided via props
            if (!localUsers.length || !localOfficers.length) {
                setLoadingStaff(true)
                Promise.all([
                    supabase.from('tm_users').select('*').order('name'),
                    supabase.from('tm_users').select('*').eq('role', 'officer').order('name')
                ]).then(([u, o]) => {
                    setLocalUsers(u.data || [])
                    setLocalOfficers(o.data || [])
                    setLoadingStaff(false)
                })
            }
        }
    }, [open]) // Intentionally empty dependency array for mounts logic mostly

    // Switch Search Type
    useEffect(() => {
        if (open) {
            setSearchLoading(true)
            supabase.from('registry_individuals')
                .select('id, full_name, first_name, last_name, contact_details, individual_type, relationships, employment_data')
                .eq('individual_type', applicantType)
                .order('full_name')
                .then(({ data }) => {
                    setIndividuals(data || [])
                    setSearchLoading(false)
                    setSelectedIndividual(null) // Clear selection on type switch
                })
        }
    }, [applicantType, open])

    // --- Submit ---
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!selectedIndividual) {
            toast({ title: "Validation Error", description: "Please select an individual.", variant: "destructive" });
            return
        }
        if (!formData.department_id) {
            toast({ title: "Validation Error", description: "Department is required.", variant: "destructive" });
            return
        }

        setLoading(true)

        try {
            // Prepare Payload
            const payload = {
                job_description: formData.job_description,
                status: 'enquiry',
                renewal_status: taskType,
                department_id: formData.department_id,
                subdepartment_id: formData.subdepartment_id || null,
                class_id: formData.class_id || null,
                subclass_id: formData.subclass_id || null,
                individual_id: selectedIndividual.id,
                applicant_type: applicantType,
                applicant_name: selectedIndividual.full_name,
                date_initiated: formData.enquiry_date,
                job_level: {
                    level: formData.subclass_id ? 4 :
                        formData.class_id ? 3 :
                            formData.subdepartment_id ? 2 :
                                formData.department_id ? 1 : null,
                    class_id: formData.class_id || null,
                    subclass_id: formData.subclass_id || null,
                    department_id: formData.department_id ? parseInt(formData.department_id) : null,
                    subdepartment_id: formData.subdepartment_id ? parseInt(formData.subdepartment_id) : null
                },
                // Relations
                principal_member: applicantType === 'dependant' ? formData.principal_member_id : selectedIndividual.id,
                company_id: selectedCompany || null,
                understudy: selectedUnderstudy || null,

                // Staff
                officer_id: formData.officer_id === 'none' || !formData.officer_id ? null : formData.officer_id,
                task_manager_id: formData.task_manager_id === 'none' || !formData.task_manager_id ? null : formData.task_manager_id,
                task_assistant_id: formData.task_assistant_id === 'none' || !formData.task_assistant_id ? null : formData.task_assistant_id,

                // JSONB fields
                dependant_member: includeDependants ? availableDependants
                    .filter(d => selectedDependants.includes(d.id.toString()))
                    .map(d => ({ id: d.id, name: d.full_name, relationship: d.relationship_type })) : [],

                references: includeReferences ? availableReferences
                    .filter(r => selectedReferences.includes(r.id.toString()))
                    .map(r => ({ id: r.id, name: r.full_name, relationship: 'Reference' })) : [],

                stages: {
                    '1e6ebd85-db1e-4eb9-abb6-5fc145ac8caa': {
                        date: format(new Date(), 'dd/MM/yyyy'),
                        status: 'completed',
                        completedAt: new Date().toISOString()
                    }
                }
            }

            const { data, error } = await supabase.from('tm_tasks').insert([payload]).select().single()

            if (error) throw error

            // SUCCESS FLOW
            onEnquiryCreated(data)
            toast({
                title: "Success",
                description: "Enquiry created successfully.",
                variant: "default",
                className: "bg-green-500 text-white border-none"
            })
            onOpenChange(false)

        } catch (error: any) {
            console.error(error)
            toast({
                title: "Error",
                description: error.message || "Failed to create enquiry",
                variant: "destructive"
            })
        } finally {
            setLoading(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto border border-gray-200/50 shadow-lg">
                <DialogHeader className="border-b border-gray-200/50 pb-4 bg-white/50">
                    <DialogTitle className="text-2xl font-bold text-gray-900">New Enquiry</DialogTitle>
                    <DialogDescription className="text-gray-600">
                        Record a new client enquiry to start the process
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-6 pt-4">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                        {/* LEFT COLUMN: IDENTIFICATION */}
                        <div className="lg:col-span-1 space-y-6">
                            {/* Applicant Type */}
                            <Card>
                                <CardHeader className="pb-3 bg-blue-50/50">
                                    <CardTitle className="text-base font-semibold flex items-center gap-2 text-blue-800">
                                        <User className="h-4 w-4" /> Applicant Type
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="pt-4">
                                    <RadioGroup value={applicantType} onValueChange={(v: any) => setApplicantType(v)} className="space-y-2">
                                        <div className="flex items-center space-x-2"><RadioGroupItem value="principal" id="r1" /><Label htmlFor="r1">Principal</Label></div>
                                        <div className="flex items-center space-x-2"><RadioGroupItem value="dependant" id="r2" /><Label htmlFor="r2">Dependant</Label></div>
                                    </RadioGroup>
                                </CardContent>
                            </Card>

                            {/* Individual Select */}
                            <Card>
                                <CardHeader className="pb-3 bg-blue-50/50">
                                    <CardTitle className="text-base font-semibold flex items-center gap-2 text-blue-800">
                                        <Users className="h-4 w-4" /> {selectedIndividual ? 'Selected Individual' : 'Select Individual'}
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="pt-4">
                                    <Popover open={isIndividualPopoverOpen} onOpenChange={setIsIndividualPopoverOpen}>
                                        <PopoverTrigger asChild>
                                            <Button variant="outline" role="combobox" className="w-full justify-between" disabled={searchLoading}>
                                                {selectedIndividual ? selectedIndividual.full_name : (searchLoading ? "Loading..." : `Select ${applicantType}...`)}
                                                <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-[300px] p-0">
                                            <Command>
                                                <CommandInput placeholder="Search..." />
                                                <CommandEmpty>No results found.</CommandEmpty>
                                                <CommandGroup className="max-h-60 overflow-auto">
                                                    {individuals.map((ind) => (
                                                        <CommandItem key={ind.id} value={ind.full_name} onSelect={() => {
                                                            handleIndividualSelect(ind)
                                                            setIsIndividualPopoverOpen(false)
                                                        }}>
                                                            <Check className={cn("mr-2 h-4 w-4", selectedIndividual?.id === ind.id ? "opacity-100" : "opacity-0")} />
                                                            {ind.full_name}
                                                        </CommandItem>
                                                    ))}
                                                </CommandGroup>
                                            </Command>
                                        </PopoverContent>
                                    </Popover>
                                </CardContent>
                            </Card>

                            {/* Company & Understudy */}
                            <Card>
                                <CardHeader className="pb-3 bg-blue-50/50">
                                    <CardTitle className="text-base font-semibold flex items-center gap-2 text-blue-800">
                                        <Building2 className="h-4 w-4" /> Company Info
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4 pt-4">
                                    <Select value={selectedCompany} onValueChange={handleCompanyChange} disabled={loadingCompanies || !companies.length}>
                                        <SelectTrigger><SelectValue placeholder={loadingCompanies ? "Loading..." : "Select company..."} /></SelectTrigger>
                                        <SelectContent>
                                            {companies.map(c => (
                                                <SelectItem key={c.id} value={c.id.toString()}>
                                                    {c.company_name} {c.is_current && <Badge variant="outline" className="ml-2 bg-green-50 text-green-700">Current</Badge>}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>

                                    <Select value={selectedUnderstudy} onValueChange={setSelectedUnderstudy} disabled={!selectedCompany || !understudies.length}>
                                        <SelectTrigger><SelectValue placeholder="Select understudy..." /></SelectTrigger>
                                        <SelectContent>
                                            {understudies.map(u => <SelectItem key={u.id} value={u.id.toString()}>{u.full_name}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </CardContent>
                            </Card>

                            {/* Relationships Checkboxes */}
                            {(availableDependants.length > 0 || availableReferences.length > 0) && (
                                <Card>
                                    <CardHeader className="pb-3 bg-blue-50/50"><CardTitle className="text-base font-semibold text-blue-800"><UserPlus className="h-4 w-4 inline mr-2" />Relations</CardTitle></CardHeader>
                                    <CardContent className="pt-4 space-y-4">
                                        {availableDependants.length > 0 && (
                                            <div className="space-y-2">
                                                <div className="flex items-center space-x-2">
                                                    <input type="checkbox" checked={includeDependants} onChange={e => {
                                                        setIncludeDependants(e.target.checked); if (!e.target.checked) setSelectedDependants([])
                                                    }} className="h-4 w-4 rounded border-gray-300" />
                                                    <label className="text-sm font-medium">Include Family/Principal</label>
                                                </div>
                                                {includeDependants && (
                                                    <div className="pl-4 max-h-32 overflow-y-auto border-l-2 border-gray-100">
                                                        {availableDependants.map(d => (
                                                            <div key={d.id} className="flex items-center space-x-2 mt-1">
                                                                <input type="checkbox" checked={selectedDependants.includes(d.id.toString())} onChange={e => {
                                                                    setSelectedDependants(prev => e.target.checked ? [...prev, d.id.toString()] : prev.filter(x => x !== d.id.toString()))
                                                                }} />
                                                                <span className="text-xs">{d.full_name} <span className="text-gray-400">({d.relationship_type})</span></span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                        {availableReferences.length > 0 && (
                                            <div className="space-y-2">
                                                <div className="flex items-center space-x-2">
                                                    <input type="checkbox" checked={includeReferences} onChange={e => {
                                                        setIncludeReferences(e.target.checked); if (!e.target.checked) setSelectedReferences([])
                                                    }} className="h-4 w-4 rounded border-gray-300" />
                                                    <label className="text-sm font-medium">Include References</label>
                                                </div>
                                                {includeReferences && (
                                                    <div className="pl-4 max-h-32 overflow-y-auto border-l-2 border-gray-100">
                                                        {availableReferences.map(r => (
                                                            <div key={r.id} className="flex items-center space-x-2 mt-1">
                                                                <input type="checkbox" checked={selectedReferences.includes(r.id.toString())} onChange={e => {
                                                                    setSelectedReferences(prev => e.target.checked ? [...prev, r.id.toString()] : prev.filter(x => x !== r.id.toString()))
                                                                }} />
                                                                <span className="text-xs">{r.full_name}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            )}
                        </div>

                        {/* RIGHT COLUMN: TASK DETAILS */}
                        <div className="lg:col-span-2 space-y-6">
                            {/* Basic Details */}
                            <Card>
                                <CardHeader className="pb-3 bg-blue-50/50">
                                    <CardTitle className="text-base font-semibold flex items-center gap-2 text-blue-800">
                                        <FileText className="h-4 w-4" /> Task Details
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="pt-4 space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <Label>Task Type</Label>
                                            <Select value={taskType} onValueChange={(v: any) => setTaskType(v)}>
                                                <SelectTrigger><SelectValue /></SelectTrigger>
                                                <SelectContent><SelectItem value="new">New</SelectItem><SelectItem value="renewal">Renewal</SelectItem></SelectContent>
                                            </Select>
                                        </div>
                                        <div>
                                            <Label>Date</Label>
                                            <Input type="date" value={formData.enquiry_date} onChange={e => updateForm({ enquiry_date: e.target.value })} required />
                                        </div>
                                    </div>
                                    <div>
                                        <Label>Job Description</Label>
                                        <Textarea value={formData.job_description} onChange={e => updateForm({ job_description: e.target.value })} placeholder="Details..." className="min-h-[80px]" required />
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Department Hierarchy */}
                            <Card>
                                <CardHeader className="pb-3 bg-blue-50/50">
                                    <CardTitle className="text-base font-semibold flex items-center gap-2 text-blue-800">
                                        <Shield className="h-4 w-4" /> Department & Classification
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="pt-4 space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <Label>Department</Label>
                                            <Select value={formData.department_id} onValueChange={handleDepartmentChange}>
                                                <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                                                <SelectContent>{departments.map(d => <SelectItem key={d.id} value={d.id.toString()}>{d.name}</SelectItem>)}</SelectContent>
                                            </Select>
                                        </div>
                                        <div>
                                            <Label>Subdepartment</Label>
                                            <Select value={formData.subdepartment_id} onValueChange={handleSubDepartmentChange} disabled={!formData.department_id}>
                                                <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                                                <SelectContent>{availableSubdepartments.map(s => <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>)}</SelectContent>
                                            </Select>
                                        </div>
                                        <div>
                                            <Label>Class</Label>
                                            <Select value={formData.class_id} onValueChange={handleClassChange} disabled={!availableClasses.length}>
                                                <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                                                <SelectContent>{availableClasses.map(c => <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>)}</SelectContent>
                                            </Select>
                                        </div>
                                        <div>
                                            <Label>Subclass</Label>
                                            <Select value={formData.subclass_id} onValueChange={v => updateForm({ subclass_id: v })} disabled={!availableSubclasses.length}>
                                                <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                                                <SelectContent>{availableSubclasses.map(s => <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>)}</SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Staff */}
                            <Card>
                                <CardHeader className="pb-3 bg-blue-50/50">
                                    <CardTitle className="text-base font-semibold flex items-center gap-2 text-blue-800">
                                        <UserCheck className="h-4 w-4" /> Staff Assignment
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="pt-4 space-y-4">
                                    <div className="space-y-4">
                                        <div>
                                            <Label className="text-xs">Officer ({availableOfficers.length})</Label>
                                            <Select value={formData.officer_id} onValueChange={v => updateForm({ officer_id: v })} disabled={!formData.subdepartment_id}>
                                                <SelectTrigger className="h-8"><SelectValue placeholder="Select Officer" /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="none">No Officer</SelectItem>
                                                    {availableOfficers.map(o => <SelectItem key={o.id} value={o.id.toString()}>{o.name}</SelectItem>)}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div>
                                            <Label className="text-xs">Manager ({availableManagers.length})</Label>
                                            <Select value={formData.task_manager_id} onValueChange={v => updateForm({ task_manager_id: v })} disabled={!formData.subdepartment_id}>
                                                <SelectTrigger className="h-8"><SelectValue placeholder="Select Manager" /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="none">No Manager</SelectItem>
                                                    {availableManagers.map(m => <SelectItem key={m.id} value={m.id.toString()}>{m.name}</SelectItem>)}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div>
                                            <Label className="text-xs">Assistant ({availableAssistants.length})</Label>
                                            <Select value={formData.task_assistant_id} onValueChange={v => updateForm({ task_assistant_id: v })} disabled={!formData.task_manager_id}>
                                                <SelectTrigger className="h-8"><SelectValue placeholder="Select Assistant" /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="none">No Assistant</SelectItem>
                                                    {availableAssistants.map(a => <SelectItem key={a.id} value={a.id.toString()}>{a.name}</SelectItem>)}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>Cancel</Button>
                        <Button type="submit" disabled={loading} className="bg-blue-600 hover:bg-blue-700">
                            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Create Enquiry
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}