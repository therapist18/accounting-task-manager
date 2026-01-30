// @ts-nocheck
"use client"

import { useState, useCallback, useMemo, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Check, ChevronsUpDown, Loader2, User, Users, Building2, FileText, UserPlus, UserCheck, Shield, HelpCircle, Calendar, MessageSquare, ListTodo, Phone, Database } from "lucide-react"
import { cn } from "@/lib/utils"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Textarea } from "@/components/ui/textarea"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Card, CardContent, CardTitle, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import supabase from "@/lib/supabase/client"
import { toast } from "@/hooks/use-toast"
import { format } from "date-fns"
import { ScrollArea } from "@/components/ui/scroll-area"

const CLASS_D_ID = '1750687058159';

interface JobQuestion {
    id: string
    label: string
    type: 'text' | 'number' | 'date' | 'select' | 'multiselect' | 'boolean'
    required: boolean
    options?: string[]
    linked_field_id?: string
    applicant_types?: string[]
    default_value?: string
}

interface Individual {
    id: number
    full_name: string
    contact_details?: {
        phone?: { kenyan?: { primary?: string } }
    }
    individual_type: 'principal' | 'dependant'
    relationships?: any[]
    employment_data?: any
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
    const [loading, setLoading] = useState(false)
    const [searchLoading, setSearchLoading] = useState(false)
    const [loadingRelations, setLoadingRelations] = useState(false)
    const [loadingQuestions, setLoadingQuestions] = useState(false)

    // Data lists
    const [individuals, setIndividuals] = useState<Individual[]>([])
    const [jobQuestions, setJobQuestions] = useState<JobQuestion[]>([])
    const [jobAnswers, setJobAnswers] = useState<Record<string, any>>({})
    const [masterFieldsData, setMasterFieldsData] = useState<Record<string, any[]>>({})

    // Selection State
    const [applicantType, setApplicantType] = useState<'principal' | 'dependant'>('principal')
    const [selectedIndividual, setSelectedIndividual] = useState<Individual | null>(null)
    const [principalForDependant, setPrincipalForDependant] = useState<Individual | null>(null)
    const [companies, setCompanies] = useState<any[]>([])
    const [selectedCompany, setSelectedCompany] = useState<string>('')
    const [understudies, setUnderstudies] = useState<any[]>([])
    const [selectedUnderstudy, setSelectedUnderstudy] = useState<string>('')

    // Multi-select relations
    const [includeDependants, setIncludeDependants] = useState(false)
    const [availableDependants, setAvailableDependants] = useState<any[]>([])
    const [selectedDependants, setSelectedDependants] = useState<string[]>([])
    const [includeReferences, setIncludeReferences] = useState(false)
    const [availableReferences, setAvailableReferences] = useState<any[]>([])
    const [selectedReferences, setSelectedReferences] = useState<string[]>([])
const [formData, setFormData] = useState({
        job_description: '',
        department_id: '',
        subdepartment_id: '',
        class_id: '',
        subclass_id: '',
        officer_id: '',
        task_manager_id: '',
        enquiry_date: new Date().toISOString().split('T')[0]
    })
    const [isIndividualPopoverOpen, setIsIndividualPopoverOpen] = useState(false)

    // --- Form Reset Logic ---
    const resetForm = useCallback(() => {
        setFormData({
            job_description: '',
            department_id: '',
            subdepartment_id: '',
            class_id: '',
            subclass_id: '',
            officer_id: '',
            task_manager_id: '',
            enquiry_date: new Date().toISOString().split('T')[0]
        })
        setSelectedIndividual(null)
        setSelectedCompany('')
        setSelectedUnderstudy('')
        setUnderstudies([])
        setCompanies([])
        setJobAnswers({})
        setJobQuestions([])
        setSelectedDependants([])
        setIncludeDependants(false)
        setSelectedReferences([])
        setIncludeReferences(false)
    }, [])

   useEffect(() => {
        if (!open) {
            setFormData({
                job_description: '',
                department_id: '',
                subdepartment_id: '',
                class_id: '',
                subclass_id: '',
                officer_id: '',
                task_manager_id: '',
                enquiry_date: new Date().toISOString().split('T')[0]
            })
            setSelectedIndividual(null)
            setSelectedCompany('')
            setSelectedUnderstudy('')
            setJobAnswers({})
            setIncludeDependants(false)
            setIncludeReferences(false)
        }
    }, [open])

    const availableSubdepartments = useMemo(() => {
        const dept = departments.find(d => d.id.toString() === formData.department_id)
        return dept?.tm_subdepartments || []
    }, [formData.department_id, departments])

    const availableClasses = useMemo(() => {
        const sub = availableSubdepartments.find(s => s.id.toString() === formData.subdepartment_id)
        return sub?.classes || []
    }, [availableSubdepartments, formData.subdepartment_id])

    const fetchJobQuestions = useCallback(async (levelObj: any) => {
        setLoadingQuestions(true)
        try {
            const { data, error } = await supabase
                .from('tm_class_requirements')
                .select('job_specific_questions')
                .contains('job_level', levelObj) 
                .maybeSingle()

            if (data?.job_specific_questions) {
                const questions = data.job_specific_questions as JobQuestion[]
                setJobQuestions(questions)
                const initial: any = {}
                questions.forEach(q => { if (q.default_value) initial[q.id] = q.default_value })
                setJobAnswers(initial)

                const linkedIds = questions.filter(q => q.linked_field_id).map(q => q.linked_field_id)
                if (linkedIds.length) {
                    const { data: mFields } = await supabase.from('tm_job_fields').select('id, options').in('id', linkedIds)
                    const mData: any = {}
                    mFields?.forEach(f => mData[f.id] = f.options || [])
                    setMasterFieldsData(mData)
                }
            } else {
                setJobQuestions([])
            }
        } finally {
            setLoadingQuestions(false)
        }
    }, [])

    useEffect(() => {
        if (!formData.department_id) return
        const levelObj = {
            department_id: Number(formData.department_id),
            subdepartment_id: formData.subdepartment_id ? Number(formData.subdepartment_id) : null,
            class_id: formData.class_id ? Number(formData.class_id) : null,
            level: formData.class_id ? 3 : formData.subdepartment_id ? 2 : 1
        }
        fetchJobQuestions(levelObj)
    }, [formData.department_id, formData.subdepartment_id, formData.class_id, fetchJobQuestions])

    useEffect(() => {
        if (open) {
            setSearchLoading(true)
            supabase.from('registry_individuals')
                .select('id, full_name, contact_details, individual_type, relationships, employment_data')
                .eq('individual_type', applicantType)
                .order('full_name')
                .then(({ data }) => { 
                    setIndividuals(data || [])
                    setSearchLoading(false)
                })
        }
    }, [open, applicantType])

    const fetchUnderstudies = useCallback(async (companyId: string) => {
        if (!companyId) { setUnderstudies([]); return }
        const { data: companyData } = await supabase.from('acc_portal_company_duplicate').select('understudy').eq('id', companyId).single()
        const understudyList = companyData?.understudy || []
        if (understudyList.length) {
            const { data: inds } = await supabase.from('registry_individuals').select('id, full_name').in('id', understudyList.map((u: any) => u.individual_id))
            setUnderstudies(inds || [])
        }
    }, [])

    const handleIndividualSelect = useCallback(async (ind: Individual) => {
        setLoadingRelations(true)
        setSelectedIndividual(ind)
        setCompanies([]); setSelectedCompany('')
        setUnderstudies([]); setSelectedUnderstudy('')
        setAvailableDependants([]); setSelectedDependants([]); setIncludeDependants(false)
        setAvailableReferences([]); setSelectedReferences([]); setIncludeReferences(false)
        setPrincipalForDependant(null)

        const promises = []
        promises.push(
            supabase.from('registry_individuals').select('references').eq('id', ind.id).single()
                .then(({ data }) => {
                    const refIds = data?.references?.map(r => r.id).filter(Boolean) || []
                    return refIds.length ? supabase.from('registry_individuals').select('id, full_name').in('id', refIds) : { data: [] }
                })
        )

        const getCompaniesForInd = (target: Individual) => {
            const associations = target.employment_data?.associations || []
            const validIds = associations.filter(a => a.individual_type === 'Principal' && a.company_id).map(a => a.company_id)
            return validIds.length ? supabase.from('acc_portal_company_duplicate').select('id, company_name, understudy').in('id', validIds) : Promise.resolve({ data: [] })
        }

        if (ind.individual_type === 'principal') {
            promises.push(getCompaniesForInd(ind).then(res => ({ type: 'companies', data: res.data })))
            if (ind.relationships?.length) {
                const familyIds = ind.relationships.map(r => r.individual_id)
                promises.push(supabase.from('registry_individuals').select('id, full_name').in('id', familyIds).then(res => ({ type: 'family', data: res.data })))
            }
        } else {
            const principalRel = ind.relationships?.find(r => r.isPrincipal === 'Yes' || ['principal', 'husband', 'wife', 'father', 'mother'].includes(r.relationship?.toLowerCase()))
            if (principalRel) {
                promises.push(
                    supabase.from('registry_individuals').select('id, full_name, employment_data').eq('id', principalRel.individual_id).single()
                        .then(async ({ data: principal }) => {
                            if (principal) {
                                const comps = await getCompaniesForInd(principal)
                                return { type: 'principal_member', data: principal, companies: comps.data }
                            }
                            return null
                        })
                )
            }
        }

        try {
            const results = await Promise.all(promises)
            if (results[0]?.data) setAvailableReferences(results[0].data)

            results.forEach(res => {
                if (res?.type === 'companies') setCompanies(res.data)
                if (res?.type === 'family') {
                    setAvailableDependants(res.data.map(f => {
                        const rel = ind.relationships.find(r => r.individual_id === f.id)
                        return { ...f, relationship_type: rel?.relationship || 'Family' }
                    }))
                }
                if (res?.type === 'principal_member') {
                    setPrincipalForDependant(res.data)
                    setCompanies(res.companies)
                    setAvailableDependants([{ ...res.data, relationship_type: 'Principal Member' }])
                    setIncludeDependants(true)
                    setSelectedDependants([res.data.id.toString()])
                }
            })
        } finally {
            setLoadingRelations(false)
            setIsIndividualPopoverOpen(false)
        }
    }, [])

    const handleCompanyChange = (value: string) => {
        setSelectedCompany(value)
        fetchUnderstudies(value)
    }

   const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!selectedIndividual || !formData.department_id) return

        setLoading(true)
        try {
            const participants = [
                { 
                    id: selectedIndividual.id, 
                    name: selectedIndividual.full_name, 
                    role: [applicantType], 
                    type: "individual", 
                    is_primary: true 
                }
            ]

            if (selectedCompany) {
                const c = companies.find(x => x.id.toString() === selectedCompany)
                participants.push({ id: c.id, name: c.company_name, role: ['company'], type: "company" })
            }

            // Only include understudy if the specific class is selected
            if (selectedUnderstudy && formData.class_id === CLASS_D_ID) {
                const u = understudies.find(x => x.id.toString() === selectedUnderstudy)
                participants.push({ id: u.id, name: u.full_name, role: ['understudy'], type: "individual" })
            }

            const payload = {
                status: 'enquiry',
                date_initiated: new Date(formData.enquiry_date).toISOString(),
                job_description: formData.job_description,
                // --- ADDED: Root level IDs ---
                individual_id: selectedIndividual.id,
                company_id: selectedCompany ? Number(selectedCompany) : null,
                officer_id: formData.officer_id ? Number(formData.officer_id) : null,
                task_manager_id: formData.task_manager_id ? Number(formData.task_manager_id) : null,
                
                job_level: {
                    level: formData.class_id ? 3 : formData.subdepartment_id ? 2 : 1,
                    department_id: Number(formData.department_id),
                    subdepartment_id: Number(formData.subdepartment_id),
                    class_id: formData.class_id ? Number(formData.class_id) : null
                },
                // --- UPDATED: Include role in applicant_details ---
                applicant_details: { 
                    id: selectedIndividual.id, 
                    name: selectedIndividual.full_name, 
                    type: "individual",
                    role: applicantType 
                },
                participants_details: participants,
                job_specific_answers: jobAnswers,
                applied_by: "11",
                stages: { '1e6ebd85-db1e-4eb9-abb6-5fc145ac8caa': { status: "completed", date: format(new Date(), 'dd/MM/yyyy') } }
            }

            const { data, error } = await supabase.from('tm_tasks').insert([payload]).select().single()
            if (error) throw error
            
            onEnquiryCreated(data) // This updates state in TasksPage
            onOpenChange(false)
        } catch (error) {
            console.error(error)
            toast({ title: "Error", description: "Failed to save enquiry.", variant: "destructive" })
        } finally {
            setLoading(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-[1200px] max-h-[95vh] p-0 flex flex-col border-none shadow-2xl overflow-hidden">
                <DialogHeader className="p-6 bg-blue-600 text-white shrink-0">
                    <div className="flex items-center gap-4">
                        <div className="bg-white/20 p-2.5 rounded-xl"><ListTodo className="h-6 w-6" /></div>
                        <div>
                            <DialogTitle className="text-2xl font-bold tracking-tight">New Client Enquiry</DialogTitle>
                            <DialogDescription className="text-blue-100">Initialize a task with smart data linking and job questions</DialogDescription>
                        </div>
                    </div>
                </DialogHeader>

                <ScrollArea className="flex-1 bg-slate-50/50">
                    <form id="enquiry-form" onSubmit={handleSubmit} className="p-8 space-y-8">
                        <div className="grid grid-cols-12 gap-8">
                            
                            <div className="col-span-12 lg:col-span-4 space-y-6">
                                <h3 className="text-xs font-bold uppercase tracking-wider text-blue-600 flex items-center gap-2">
                                    <User className="h-4 w-4" /> Client Identification
                                </h3>
                                
                                <Card className="border-blue-100 shadow-sm overflow-hidden">
                                    <CardHeader className="bg-blue-50/50 py-3 border-b border-blue-100">
                                        <CardTitle className="text-xs font-bold text-blue-800">Primary Applicant</CardTitle>
                                    </CardHeader>
                                    <CardContent className="p-5 space-y-5">
                                        <RadioGroup value={applicantType} onValueChange={(v: any) => setApplicantType(v)} className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-lg">
                                            {['principal', 'dependant'].map(t => (
                                                <div key={t} className="relative">
                                                    <RadioGroupItem value={t} id={t} className="sr-only" />
                                                    <Label htmlFor={t} className={cn("flex items-center justify-center py-2 rounded-md cursor-pointer text-[10px] font-black transition-all", applicantType === t ? "bg-white text-blue-600 shadow-sm" : "text-slate-500")}>
                                                        {t.toUpperCase()}
                                                    </Label>
                                                </div>
                                            ))}
                                        </RadioGroup>

                                        <div className="space-y-2">
                                            <Label className="text-[11px] font-bold text-slate-500">Registry Search</Label>
                                            <Popover open={isIndividualPopoverOpen} onOpenChange={setIsIndividualPopoverOpen}>
                                                <PopoverTrigger asChild>
                                                    <Button variant="outline" className="w-full justify-between h-11 border-slate-200 bg-white hover:border-blue-300">
                                                        {selectedIndividual ? <span className="font-bold">{selectedIndividual.full_name}</span> : "Select from database..."}
                                                        {searchLoading ? <Loader2 className="h-4 w-4 animate-spin text-blue-500" /> : <ChevronsUpDown className="h-4 w-4 opacity-30" />}
                                                    </Button>
                                                </PopoverTrigger>
                                                <PopoverContent className="w-[350px] p-0" align="start">
                                                    <Command>
                                                        <CommandInput placeholder="Search name..." />
                                                        <CommandList>
                                                            <CommandEmpty>No records.</CommandEmpty>
                                                            <CommandGroup>
                                                                {individuals.map(ind => (
                                                                    <CommandItem key={ind.id} value={ind.full_name} onSelect={() => handleIndividualSelect(ind)}>
                                                                        <Check className={cn("mr-2 h-4 w-4 text-blue-600", selectedIndividual?.id === ind.id ? "opacity-100" : "opacity-0")} />
                                                                        {ind.full_name}
                                                                    </CommandItem>
                                                                ))}
                                                            </CommandGroup>
                                                        </CommandList>
                                                    </Command>
                                                </PopoverContent>
                                            </Popover>
                                            {loadingRelations && <p className="text-[10px] text-blue-500 animate-pulse flex items-center gap-1"><Database className="h-3 w-3" /> Fetching linked associations...</p>}
                                        </div>

                                        <div className="space-y-3 pt-2">
                                        <Label className="text-[11px] font-bold text-slate-500 uppercase">Employment Entity</Label>
                                        <Select value={selectedCompany} onValueChange={handleCompanyChange}>
                                            <SelectTrigger className="h-11 border-blue-100 bg-blue-50/20"><SelectValue placeholder="Linked Company..." /></SelectTrigger>
                                            <SelectContent>
                                                {companies.map(c => <SelectItem key={c.id} value={c.id.toString()}>{c.company_name}</SelectItem>)}
                                            </SelectContent>
                                        </Select>

                                            {/* Logic Update: Only show if class matches Class D ID */}
                                           {formData.class_id === CLASS_D_ID && understudies.length > 0 && (
                                            <div className="space-y-2 mt-4 animate-in fade-in slide-in-from-top-1">
                                                <Label className="text-[11px] font-bold text-slate-500 uppercase">Related Understudy</Label>
                                                <Select value={selectedUnderstudy} onValueChange={setSelectedUnderstudy}>
                                                    <SelectTrigger className="h-11 border-amber-200 bg-amber-50/20">
                                                        <SelectValue placeholder="Select understudy..." />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {understudies.map(u => <SelectItem key={u.id} value={u.id.toString()}>{u.full_name}</SelectItem>)}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        )}
                                        </div>
                                    </CardContent>
                                </Card>

                                {(availableDependants.length > 0 || availableReferences.length > 0) && (
                                    <div className="space-y-4">
                                        <h3 className="text-xs font-bold uppercase tracking-wider text-blue-600 flex items-center gap-2">
                                            <UserPlus className="h-4 w-4" /> Family & References
                                        </h3>
                                        <Card className="border-blue-100 shadow-sm bg-white">
                                            <CardContent className="p-5 space-y-4">
                                                {availableDependants.length > 0 && (
                                                    <div className="space-y-3">
                                                        <div className="flex items-center space-x-2">
                                                            <Checkbox id="inc-dep" checked={includeDependants} onCheckedChange={(v) => setIncludeDependants(!!v)} />
                                                            <Label htmlFor="inc-dep" className="text-xs font-bold text-blue-800">Include Dependants/Family</Label>
                                                        </div>
                                                        {includeDependants && (
                                                            <div className="pl-6 space-y-2 border-l-2 border-blue-100">
                                                                {availableDependants.map(d => (
                                                                    <div key={d.id} className="flex items-center space-x-2">
                                                                        <Checkbox id={`d-${d.id}`} checked={selectedDependants.includes(d.id.toString())} onCheckedChange={(v) => setSelectedDependants(prev => v ? [...prev, d.id.toString()] : prev.filter(x => x !== d.id.toString()))} />
                                                                        <label htmlFor={`d-${d.id}`} className="text-[11px] font-medium cursor-pointer">{d.full_name} <span className="text-slate-400">({d.relationship_type})</span></label>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                                {availableReferences.length > 0 && (
                                                    <div className="space-y-3">
                                                        <div className="flex items-center space-x-2">
                                                            <Checkbox id="inc-ref" checked={includeReferences} onCheckedChange={(v) => setIncludeReferences(!!v)} />
                                                            <Label htmlFor="inc-ref" className="text-xs font-bold text-blue-800">Include References</Label>
                                                        </div>
                                                        {includeReferences && (
                                                            <div className="pl-6 space-y-2 border-l-2 border-blue-100">
                                                                {availableReferences.map(r => (
                                                                    <div key={r.id} className="flex items-center space-x-2">
                                                                        <Checkbox id={`r-${r.id}`} checked={selectedReferences.includes(r.id.toString())} onCheckedChange={(v) => setSelectedReferences(prev => v ? [...prev, r.id.toString()] : prev.filter(x => x !== r.id.toString()))} />
                                                                        <label htmlFor={`r-${r.id}`} className="text-[11px] font-medium cursor-pointer">{r.full_name}</label>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </CardContent>
                                        </Card>
                                    </div>
                                )}
                            </div>

                            <div className="col-span-12 lg:col-span-8 space-y-8">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-4">
                                        <h3 className="text-xs font-bold uppercase tracking-wider text-blue-600 flex items-center gap-2">
                                            <Shield className="h-4 w-4" /> Process Classification
                                        </h3>
                                        <Card className="border-blue-100 shadow-sm bg-white">
                                            <CardContent className="p-5 space-y-4">
                                                <div className="space-y-1.5"><Label className="text-[10px] font-bold text-slate-400">DEPARTMENT</Label><Select value={formData.department_id} onValueChange={id => setFormData(prev => ({ ...prev, department_id: id, subdepartment_id: '', class_id: '' }))}><SelectTrigger className="h-10 border-blue-50 bg-blue-50/10"><SelectValue placeholder="Choose Department" /></SelectTrigger><SelectContent>{departments.map(d => <SelectItem key={d.id} value={d.id.toString()}>{d.name}</SelectItem>)}</SelectContent></Select></div>
                                                <div className="space-y-1.5"><Label className="text-[10px] font-bold text-slate-400">SUB-DEPARTMENT</Label><Select value={formData.subdepartment_id} onValueChange={id => setFormData(prev => ({ ...prev, subdepartment_id: id, class_id: '' }))} disabled={!formData.department_id}><SelectTrigger className="h-10 border-blue-50 bg-blue-50/10"><SelectValue placeholder="Choose Sub-Dept" /></SelectTrigger><SelectContent>{availableSubdepartments.map(s => <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>)}</SelectContent></Select></div>
                                                <div className="space-y-1.5"><Label className="text-[10px] font-bold text-slate-400">SERVICE CLASS</Label><Select value={formData.class_id} onValueChange={id => setFormData(prev => ({ ...prev, class_id: id }))} disabled={!formData.subdepartment_id}><SelectTrigger className="h-10 border-blue-50 bg-blue-50/10"><SelectValue placeholder="Choose Service Class" /></SelectTrigger><SelectContent>{availableClasses.map(c => <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>)}</SelectContent></Select></div>
                                            </CardContent>
                                        </Card>
                                    </div>

                                   <div className="space-y-4">
                                    <h3 className="text-xs font-bold uppercase tracking-wider text-blue-600 flex items-center gap-2">
                                        <UserCheck className="h-4 w-4" /> Internal Processing
                                    </h3>
                                    <Card className="border-blue-100 shadow-sm bg-white">
                                        <CardContent className="p-5 space-y-4">
                                            <div className="space-y-1.5">
                                                <Label className="text-[10px] font-bold text-slate-400">ASSIGNED MANAGER</Label>
                                                <Select value={formData.task_manager_id} onValueChange={id => setFormData(prev => ({ ...prev, task_manager_id: id }))}>
                                                    <SelectTrigger className="h-10 border-blue-50 bg-blue-50/10"><SelectValue placeholder="Select Staff" /></SelectTrigger>
                                                    <SelectContent>
                                                        {/* FIXED: Check for u.full_name as well */}
                                                        {users.map(u => <SelectItem key={u.id} value={u.id.toString()}>{u.full_name || u.name}</SelectItem>)}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className="space-y-1.5">
                                                <Label className="text-[10px] font-bold text-slate-400">CLIENT OFFICER</Label>
                                                <Select value={formData.officer_id} onValueChange={id => setFormData(prev => ({ ...prev, officer_id: id }))}>
                                                    <SelectTrigger className="h-10 border-blue-50 bg-blue-50/10"><SelectValue placeholder="Select Officer" /></SelectTrigger>
                                                    <SelectContent>
                                                        {/* FIXED: Check for o.full_name as well */}
                                                        {officers.map(o => <SelectItem key={o.id} value={o.id.toString()}>{o.full_name || o.name}</SelectItem>)}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                                <div className="space-y-1.5"><Label className="text-[10px] font-bold text-slate-400">ENQUIRY DATE</Label><div className="relative"><Input type="date" value={formData.enquiry_date} onChange={e => setFormData(prev => ({ ...prev, enquiry_date: e.target.value }))} className="pl-10 h-10" /><Calendar className="absolute left-3 top-3 h-4 w-4 text-blue-400 pointer-events-none" /></div></div>
                                            </CardContent>
                                        </Card>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <div className="flex items-center justify-between px-1">
                                        <h3 className="text-xs font-bold uppercase tracking-wider text-blue-600 flex items-center gap-2">
                                            <HelpCircle className="h-4 w-4" /> Job Requirements
                                        </h3>
                                        {loadingQuestions && <Loader2 className="h-3 w-3 animate-spin text-blue-500" />}
                                    </div>
                                    
                                    <Card className={cn("border-blue-100 shadow-sm transition-all bg-white")}>
                                        <CardContent className="p-6">
                                            {jobQuestions.length > 0 ? (
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-6">
                                                    {jobQuestions.map((q) => (
                                                        <div key={q.id} className="space-y-2">
                                                            <Label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                                                                {q.label}
                                                                {q.required && <span className="text-red-500">*</span>}
                                                            </Label>
                                                            
                                                            {q.type === 'text' && <Input value={jobAnswers[q.id] || ''} onChange={e => setJobAnswers(prev => ({ ...prev, [q.id]: e.target.value }))} className="h-10 bg-slate-50/50 border-blue-50" />}
                                                            {q.type === 'number' && <Input type="number" value={jobAnswers[q.id] || ''} onChange={e => setJobAnswers(prev => ({ ...prev, [q.id]: e.target.value }))} className="h-10 bg-slate-50/50 border-blue-50" />}
                                                            {q.type === 'date' && <Input type="date" value={jobAnswers[q.id] || ''} onChange={e => setJobAnswers(prev => ({ ...prev, [q.id]: e.target.value }))} className="h-10 bg-slate-50/50 border-blue-50" />}
                                                            {(q.type === 'select' || q.type === 'multiselect') && (
                                                                <Select value={jobAnswers[q.id]} onValueChange={v => setJobAnswers(prev => ({ ...prev, [q.id]: v }))}>
                                                                    <SelectTrigger className="h-10 bg-slate-50/50 border-blue-50"><SelectValue placeholder="Select..." /></SelectTrigger>
                                                                    <SelectContent>
                                                                        {(q.linked_field_id ? masterFieldsData[q.linked_field_id] : q.options)?.map((opt: any) => {
                                                                            const val = typeof opt === 'string' ? opt : opt.value;
                                                                            return <SelectItem key={val} value={val}>{typeof opt === 'string' ? opt : opt.label}</SelectItem>
                                                                        })}
                                                                    </SelectContent>
                                                                </Select>
                                                            )}
                                                            {q.type === 'boolean' && (
                                                                <div className="flex items-center gap-6 h-10">
                                                                    <div className="flex items-center gap-2"><Checkbox checked={jobAnswers[q.id] === true} onCheckedChange={() => setJobAnswers(prev => ({ ...prev, [q.id]: true }))} /><span className="text-sm font-medium">Yes</span></div>
                                                                    <div className="flex items-center gap-2"><Checkbox checked={jobAnswers[q.id] === false} onCheckedChange={() => setJobAnswers(prev => ({ ...prev, [q.id]: false }))} /><span className="text-sm font-medium">No</span></div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="text-center py-6 opacity-30">
                                                    <MessageSquare className="h-8 w-8 mx-auto mb-2 text-blue-400" />
                                                    <p className="text-[10px] font-black uppercase tracking-widest text-blue-600">No custom requirements defined</p>
                                                </div>
                                            )}
                                        </CardContent>
                                    </Card>
                                </div>

                                <div className="space-y-4">
                                    <h3 className="text-xs font-bold uppercase tracking-wider text-blue-600 flex items-center gap-2">
                                        <FileText className="h-4 w-4" /> Additional Remarks
                                    </h3>
                                    <Textarea value={formData.job_description} onChange={e => setFormData(prev => ({ ...prev, job_description: e.target.value }))} placeholder="Capture additional context here..." className="min-h-[120px] bg-white border-blue-50 p-4" />
                                </div>
                            </div>
                        </div>
                    </form>
                </ScrollArea>

                <DialogFooter className="p-6 bg-white border-t border-blue-50 shrink-0">
                    <div className="flex items-center justify-between w-full">
                        <div className="flex flex-col">
                            <span className="text-[10px] text-slate-400 font-bold tracking-widest uppercase">System Integration Active</span>
                            <span className="text-[11px] text-blue-600 font-black">{selectedIndividual?.full_name || "No Client Selected"}</span>
                        </div>
                        <div className="flex gap-3">
                            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={loading} className="text-slate-500 hover:bg-slate-100 px-6">Cancel</Button>
                            <Button type="submit" form="enquiry-form" disabled={loading || !selectedIndividual || !formData.department_id} className="px-10 bg-blue-600 hover:bg-blue-700 h-11 text-white font-bold shadow-lg shadow-blue-200">
                                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                                SAVE ENQUIRY
                            </Button>
                        </div>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}