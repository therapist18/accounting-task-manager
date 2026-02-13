// @ts-nocheck
"use client"

import { useState, useCallback, useMemo, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Check, ChevronsUpDown, Loader2, User, Users, Building2, FileText, UserPlus, UserCheck, Shield, HelpCircle, Calendar, MessageSquare, ListTodo, Phone, Database, Folder, Search, HeartHandshake, Split, X } from "lucide-react"
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
const SPONSOR_SUBDEPT_ID = '26';

// Photo document IDs
const PASSPORT_PHOTO_ID = '48f48255-e5db-4944-8864-6f35b3af4696';
const CLEAR_PHOTO_ID = 'fa74ff82-09ce-418d-8985-174158d73316';

interface JobQuestion {
    id: string
    label: string
    category?: string
    type: 'text' | 'number' | 'date' | 'select' | 'multiselect' | 'boolean'
    required: boolean
    options?: string[]
    linked_field_id?: string
    applicant_types?: string[]
    default_value?: string
    depends_on?: {
        id: string
        operator: 'equals' | 'not_equals' | 'is_not_empty' | 'is_empty'
        value: any
    }
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
    officers = [],
    taskToEdit = null
}: any) {
    const [loading, setLoading] = useState(false)
    const [searchLoading, setSearchLoading] = useState(false)
    const [loadingRelations, setLoadingRelations] = useState(false)
    const [loadingQuestions, setLoadingQuestions] = useState(false)
    const [loadingStaff, setLoadingStaff] = useState(false)
    const [applicantPhoto, setApplicantPhoto] = useState<string | null>(null)
    const [loadingPhoto, setLoadingPhoto] = useState(false)

    // Data lists
    const [individuals, setIndividuals] = useState<Individual[]>([])
    const [sponsors, setSponsors] = useState<any[]>([]) // List for sponsors
    const [jobQuestions, setJobQuestions] = useState<JobQuestion[]>([])
    const [jobAnswers, setJobAnswers] = useState<Record<string, any>>({})
    const [masterFieldsData, setMasterFieldsData] = useState<Record<string, any[]>>({})

    // Selection State
    const [applicantType, setApplicantType] = useState<'principal' | 'dependant'>('principal')
    const [selectedIndividual, setSelectedIndividual] = useState<Individual | null>(null)
    const [selectedSponsor, setSelectedSponsor] = useState<any | null>(null) // State for Sponsor
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
        officer_id: '',
        task_manager_id: '',
        task_assistant_id: '',
        enquiry_date: new Date().toISOString().split('T')[0],
        job_level: {
            level: 1,
            department_id: null,
            subdepartment_id: null,
            class_id: null,
            subclass_id: null
        }
    });

    // State for available staff
    const [availableOfficers, setAvailableOfficers] = useState<any[]>([]);
    const [availableManagers, setAvailableManagers] = useState<any[]>([]);
    const [availableAssistants, setAvailableAssistants] = useState<any[]>([]);
    const [isIndividualPopoverOpen, setIsIndividualPopoverOpen] = useState(false);
    const [isSponsorPopoverOpen, setIsSponsorPopoverOpen] = useState(false);

    // Helper function to construct Supabase storage URL
    const getSupabaseImageUrl = useCallback((filePath: string | null): string | null => {
        if (!filePath) return null;

        // If it's already a full URL, return as is
        if (filePath.startsWith('http')) return filePath;

        // Otherwise, construct the Supabase storage URL
        const bucketName = 'kyc-documents';
        const fullPath = filePath.startsWith(bucketName) ? filePath : `${bucketName}/${filePath}`;
        return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${fullPath}`;
    }, []);

    // Fetch applicant photo
    const fetchApplicantPhoto = useCallback(async (individualId: number) => {
        setLoadingPhoto(true);
        setApplicantPhoto(null);

        try {
            // Try passport photo first
            let { data: photoDoc } = await supabase
                .from('acc_portal_directors_documents')
                .select('file_path')
                .eq('director_id', individualId)
                .eq('document_id', PASSPORT_PHOTO_ID)
                .maybeSingle();

            // Fallback to clear photo
            if (!photoDoc) {
                const result = await supabase
                    .from('acc_portal_directors_documents')
                    .select('file_path')
                    .eq('director_id', individualId)
                    .eq('document_id', CLEAR_PHOTO_ID)
                    .maybeSingle();
                photoDoc = result.data;
            }

            if (photoDoc?.file_path) {
                const imageUrl = getSupabaseImageUrl(photoDoc.file_path);
                if (imageUrl) {
                    setApplicantPhoto(imageUrl);
                }
            }
        } catch (error) {
            console.error('Error fetching applicant photo:', error);
        } finally {
            setLoadingPhoto(false);
        }
    }, [getSupabaseImageUrl]);

    // --- Form Reset Logic ---
    const resetForm = useCallback(() => {
        setFormData({
            job_description: '',
            department_id: '',
            subdepartment_id: '',
            class_id: '',
            officer_id: '',
            task_manager_id: '',
            task_assistant_id: '',
            enquiry_date: new Date().toISOString().split('T')[0],
            job_level: {
                level: 1,
                department_id: null,
                subdepartment_id: null,
                class_id: null,
                subclass_id: null
            }
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
        setApplicantPhoto(null)
    }, [])

    useEffect(() => {
        if (open && taskToEdit) {
            console.log("🔹 [EnquiryDialog] Populating Edit Mode for Task:", taskToEdit.id);

            // 1. Basic Form Data
            setFormData({
                job_description: taskToEdit.job_description || '',
                department_id: String(taskToEdit.job_level?.department_id || ''),
                subdepartment_id: String(taskToEdit.job_level?.subdepartment_id || ''),
                class_id: String(taskToEdit.job_level?.class_id || ''),
                enquiry_date: taskToEdit.date_initiated ? taskToEdit.date_initiated.split('T')[0] : new Date().toISOString().split('T')[0],
                // Participants extracted below
                officer_id: taskToEdit.participants_details?.find(p => p.role?.includes('officer'))?.id?.toString() || '',
                task_manager_id: taskToEdit.participants_details?.find(p => p.role?.includes('task_manager'))?.id?.toString() || '',
                task_assistant_id: taskToEdit.participants_details?.find(p => p.role?.includes('task_assistant'))?.id?.toString() || '',
            });

            // 2. Job Specific Answers
            setJobAnswers(taskToEdit.job_specific_answers || {});

            // 3. Resolve Applicant Type
            setApplicantType(taskToEdit.applicant_details?.role || 'principal');

            // 4. Load the individual and trigger related data (Companies/Understudies)
            if (taskToEdit.individual_id) {
                supabase.from('registry_individuals')
                    .select('*')
                    .eq('id', taskToEdit.individual_id)
                    .single()
                    .then(({ data }) => {
                        if (data) {
                            handleIndividualSelect(data); // This triggers company/understudy fetch
                            if (taskToEdit.company_id) {
                                setSelectedCompany(String(taskToEdit.company_id));
                                fetchUnderstudies(String(taskToEdit.company_id)).then(() => {
                                    const understudyPart = taskToEdit.participants_details?.find(p => p.role?.includes('understudy'));
                                    if (understudyPart) setSelectedUnderstudy(String(understudyPart.id));
                                });
                            }
                        }
                    });
            }

            // 5. Handle Sponsor if applicable
            const sponsorPart = taskToEdit.participants_details?.find(p => p.role?.includes('sponsor'));
            if (sponsorPart) {
                setSelectedSponsor({ id: sponsorPart.id, full_name: sponsorPart.name });
            }
        } else if (open && !taskToEdit) {
            // Reset to clean state for new enquiry
            resetForm();
        }
    }, [open, taskToEdit]);

    const checkVisibility = useCallback((q: JobQuestion) => {
        if (!q.depends_on || !q.depends_on.id) return true;

        const parentVal = jobAnswers[q.depends_on.id];
        const targetVal = q.depends_on.value;

        switch (q.depends_on.operator) {
            case 'equals':
                return String(parentVal) === String(targetVal);
            case 'not_equals':
                return String(parentVal) !== String(targetVal);
            case 'is_not_empty':
                if (Array.isArray(parentVal)) return parentVal.length > 0;
                return parentVal !== undefined && parentVal !== null && parentVal !== '';
            case 'is_empty':
                if (Array.isArray(parentVal)) return parentVal.length === 0;
                return parentVal === undefined || parentVal === null || parentVal === '';
            default:
                return true;
        }
    }, [jobAnswers]);

    const groupedQuestions = useMemo(() => {
        const visible = jobQuestions.filter(q => checkVisibility(q));
        return visible.reduce((acc, q) => {
            const cat = q.category || "General Requirements";
            if (!acc[cat]) acc[cat] = [];
            acc[cat].push(q);
            return acc;
        }, {} as Record<string, JobQuestion[]>);
    }, [jobQuestions, checkVisibility]);

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
            const { data } = await supabase
                .from('tm_class_requirements')
                .select('job_specific_questions')
                .contains('job_level', levelObj)
                .maybeSingle()

            if (data?.job_specific_questions) {
                setJobQuestions(data.job_specific_questions as JobQuestion[])
                // Set defaults
                const initial: any = {}
                data.job_specific_questions.forEach((q: any) => {
                    if (q.default_value) initial[q.id] = q.default_value
                })
                setJobAnswers(initial)
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

    // Load Sponsors if Subdepartment is 26
    useEffect(() => {
        if (formData.subdepartment_id === SPONSOR_SUBDEPT_ID) {
            supabase.from('registry_individuals')
                .select('id, full_name')
                .order('full_name')
                .then(({ data }) => setSponsors(data || []))
        }
    }, [formData.subdepartment_id])

    // --- Staff Data Loading Logic ---
    const loadStaffData = useCallback(async () => {
        setLoadingStaff(true);
        try {
            const [usersResult, officersResult] = await Promise.all([
                supabase.from('tm_users').select('*').order('name'),
                supabase.from('tm_users').select('*').eq('role', 'officer').order('name')
            ]);

            if (usersResult.data) {
                setAvailableManagers(usersResult.data);
                setAvailableAssistants(usersResult.data);
            }
            if (officersResult.data) {
                setAvailableOfficers(officersResult.data);
            }
        } catch (err) {
            console.error("Error loading staff:", err);
            toast({ title: "Error", description: "Failed to load staff data", variant: "destructive" });
        } finally {
            setLoadingStaff(false);
        }
    }, []);

    useEffect(() => {
        // If props are explicitly provided and not empty, use them
        if (users.length > 0 || officers.length > 0) {
            if (officers.length > 0) setAvailableOfficers(officers);
            if (users.length > 0) {
                setAvailableManagers(users);
                setAvailableAssistants(users);
            }
        }
        // Otherwise, if dialog is open and we haven't loaded data yet, fetch internally
        else if (open) {
            if (availableManagers.length === 0 && availableOfficers.length === 0) {
                loadStaffData();
            }
        }
    }, [open, users, officers, loadStaffData, availableManagers.length, availableOfficers.length]);

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

        // Fetch photo
        fetchApplicantPhoto(ind.id);

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
    }, [fetchApplicantPhoto])

    const handleCompanyChange = (value: string) => {
        setSelectedCompany(value)
        fetchUnderstudies(value)
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!selectedIndividual || !formData.department_id) return

        setLoading(true)
        try {
            const participants: any[] = []

            // Extract Participant Details
            if (selectedCompany) {
                const c = companies.find(x => x.id.toString() === selectedCompany)
                if (c) participants.push({ id: c.id, name: c.company_name, role: ['company'], type: "company" })
            }
            if (selectedUnderstudy && formData.class_id === CLASS_D_ID) {
                const u = understudies.find(x => x.id.toString() === selectedUnderstudy)
                if (u) participants.push({ id: u.id, name: u.full_name, role: ['understudy'], type: "individual" })
            }
            if (formData.officer_id) {
                const officer = availableOfficers.find(o => o.id.toString() === formData.officer_id);
                if (officer) participants.push({ id: officer.id, name: officer.full_name || officer.name, role: ['officer'], type: "individual" });
            }
            if (formData.task_manager_id) {
                const manager = availableManagers.find(m => m.id.toString() === formData.task_manager_id);
                if (manager) participants.push({ id: manager.id, name: manager.full_name || manager.name, role: ['task_manager'], type: "individual" });
            }
            if (formData.subdepartment_id === SPONSOR_SUBDEPT_ID && selectedSponsor) {
                participants.push({ id: selectedSponsor.id, name: selectedSponsor.full_name, role: ['sponsor'], type: "individual" })
            }

            const payload = {
                job_description: formData.job_description,
                individual_id: selectedIndividual.id,
                company_id: selectedCompany ? Number(selectedCompany) : null,
                applicant_details: {
                    id: selectedIndividual.id,
                    name: selectedIndividual.full_name,
                    role: applicantType,
                    type: "individual"
                },
                job_level: {
                    level: formData.class_id ? 3 : formData.subdepartment_id ? 2 : 1,
                    department_id: Number(formData.department_id),
                    subdepartment_id: Number(formData.subdepartment_id),
                    class_id: formData.class_id ? Number(formData.class_id) : null
                },
                job_specific_answers: jobAnswers,
                participants_details: participants,
                // Do not overwrite date_initiated on edit if you want to keep history, 
                // or update it if it represents "last modified"
            }

            let result;
            if (taskToEdit) {
                // UPDATE
                const { data, error } = await supabase.from('tm_tasks')
                    .update(payload)
                    .eq('id', taskToEdit.id)
                    .select()
                    .single();
                if (error) throw error;
                result = data;
                toast({ title: "Success", description: "Enquiry updated successfully." });
            } else {
                // INSERT
                const insertPayload = {
                    ...payload,
                    status: 'enquiry',
                    date_initiated: new Date(formData.enquiry_date).toISOString(),
                    applied_by: "11",
                    stages: { '1e6ebd85-db1e-4eb9-abb6-5fc145ac8caa': { status: "completed", date: format(new Date(), 'dd/MM/yyyy') } }
                };
                const { data, error } = await supabase.from('tm_tasks').insert([insertPayload]).select().single();
                if (error) throw error;
                result = data;
                toast({ title: "Success", description: "Enquiry created successfully." });
            }

            // Call the callback with the updated/created task to refresh parent state
            onEnquiryCreated(result);

            // Close dialog after successful submission
            onOpenChange(false);
        } catch (error) {
            console.error(error)
            toast({ title: "Error", description: "Failed to save data.", variant: "destructive" })
        } finally {
            setLoading(false)
        }
    }

    const dialogTitle = taskToEdit
        ? `Edit Enquiry: ${taskToEdit.applicant_details?.name || 'Loading...'}`
        : "New Client Enquiry";

    // Table Row Component for consistent styling
    const TableRow = ({ label, children, required = false }: { label: string; children: React.ReactNode; required?: boolean }) => (
        <div className="grid grid-cols-12 gap-4 py-3 border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
            <div className="col-span-4 flex items-center">
                <Label className="text-xs font-semibold text-slate-700">
                    {label}
                    {required && <span className="text-red-500 ml-1">*</span>}
                </Label>
            </div>
            <div className="col-span-8">
                {children}
            </div>
        </div>
    );

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-[1600px] max-h-[95vh] p-0 flex flex-col border-none shadow-2xl overflow-hidden bg-white">
                {/* STATIC HEADER */}
                <DialogHeader className="p-6 bg-blue-600 text-white shrink-0 z-10 shadow-md relative">
                    <button
                        onClick={() => onOpenChange(false)}
                        className="absolute right-6 top-6 rounded-sm opacity-70 ring-offset-white transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 disabled:pointer-events-none"
                    >
                        <X className="h-5 w-5" />
                        <span className="sr-only">Close</span>
                    </button>
                    <div className="flex items-center justify-between pr-8">
                        <div className="flex items-center gap-4">
                            <div className="bg-white/20 p-2.5 rounded-xl"><ListTodo className="h-6 w-6" /></div>
                            <div>
                                <DialogTitle className="text-2xl font-bold tracking-tight">
                                    {dialogTitle}
                                </DialogTitle>
                                <DialogDescription className="text-blue-100 font-medium">
                                    {taskToEdit ? "Updating existing records" : "Logical requirement engine active"}
                                </DialogDescription>
                            </div>
                        </div>
                    </div>
                </DialogHeader>

                {/* SCROLLABLE CONTENT AREA */}
                <ScrollArea className="flex-1 w-full overflow-y-auto bg-slate-50/50">
                    <form id="enquiry-form" onSubmit={handleSubmit} className="p-6 space-y-4 grid grid-cols-2 gap-4">
                        <div className="col-span-1">
                            {/* CLIENT IDENTIFICATION SECTION */}
                            <Card className="border-blue-100 shadow-sm overflow-hidden bg-white mb-4">
                                <CardHeader className="bg-blue-50/50 py-3 px-6 border-b border-blue-100">
                                    <CardTitle className="text-sm font-black text-blue-800 uppercase tracking-wider flex items-center gap-2">
                                        <User className="h-4 w-4" />
                                        Client Identification
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-6 space-y-0">
                                    <TableRow label="Applicant Type" required>
                                        <RadioGroup value={applicantType} onValueChange={(v: any) => setApplicantType(v)} className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-lg max-w-sm">
                                            {['principal', 'dependant'].map(t => (
                                                <div key={t} className="relative">
                                                    <RadioGroupItem value={t} id={t} className="sr-only" />
                                                    <Label htmlFor={t} className={cn("flex items-center justify-center py-2 rounded-md cursor-pointer text-xs font-bold transition-all", applicantType === t ? "bg-white text-blue-600 shadow-sm" : "text-slate-500")}>
                                                        {t.charAt(0).toUpperCase() + t.slice(1)}
                                                    </Label>
                                                </div>
                                            ))}
                                        </RadioGroup>
                                    </TableRow>

                                    <TableRow label="Primary Applicant" required>
                                        <div className="flex items-center gap-4">
                                            {/* Photo Preview */}
                                            <div className="shrink-0">
                                                {loadingPhoto ? (
                                                    <div className="w-16 h-16 rounded-lg bg-slate-100 flex items-center justify-center">
                                                        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                                                    </div>
                                                ) : applicantPhoto ? (
                                                    <img
                                                        src={applicantPhoto}
                                                        alt="Applicant"
                                                        className="w-16 h-16 rounded-lg object-cover border-2 border-blue-100"
                                                    />
                                                ) : selectedIndividual ? (
                                                    <div className="w-16 h-16 rounded-lg bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center">
                                                        <User className="h-8 w-8 text-blue-600" />
                                                    </div>
                                                ) : (
                                                    <div className="w-16 h-16 rounded-lg bg-slate-100 flex items-center justify-center">
                                                        <User className="h-8 w-8 text-slate-400" />
                                                    </div>
                                                )}
                                            </div>

                                            {/* Search Popover */}
                                            <div className="flex-1">
                                                <Popover open={isIndividualPopoverOpen} onOpenChange={setIsIndividualPopoverOpen}>
                                                    <PopoverTrigger asChild>
                                                        <Button variant="outline" className="w-full justify-between h-11 border-slate-200 bg-white">
                                                            {selectedIndividual ? <span className="font-bold text-slate-800">{selectedIndividual.full_name}</span> : <span className="text-slate-400">Search database...</span>}
                                                            <Search className="h-4 w-4 opacity-30" />
                                                        </Button>
                                                    </PopoverTrigger>
                                                    <PopoverContent className="w-[400px] p-0" align="start">
                                                        <Command>
                                                            <CommandInput placeholder="Search name..." />
                                                            <CommandList className="max-h-[300px] overflow-y-auto">
                                                                <CommandEmpty>No individuals found.</CommandEmpty>
                                                                <CommandGroup>
                                                                    {individuals.map(ind => (
                                                                        <CommandItem key={ind.id} onSelect={() => handleIndividualSelect(ind)}>
                                                                            <Check className={cn("mr-2 h-4 w-4 text-blue-600", selectedIndividual?.id === ind.id ? "opacity-100" : "opacity-0")} />
                                                                            {ind.full_name}
                                                                        </CommandItem>
                                                                    ))}
                                                                </CommandGroup>
                                                            </CommandList>
                                                        </Command>
                                                    </PopoverContent>
                                                </Popover>
                                            </div>
                                        </div>
                                    </TableRow>

                                    <TableRow label="Employment Entity">
                                        <Select value={selectedCompany} onValueChange={handleCompanyChange}>
                                            <SelectTrigger className="h-11 border-slate-200 bg-white">
                                                <SelectValue placeholder="Select Company..." />
                                            </SelectTrigger>
                                            <SelectContent className="max-h-[300px]">
                                                {companies.map(c => <SelectItem key={c.id} value={c.id.toString()}>{c.company_name}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                    </TableRow>

                                    {formData.class_id === CLASS_D_ID && understudies.length > 0 && (
                                        <TableRow label="Related Understudy">
                                            <Select value={selectedUnderstudy} onValueChange={setSelectedUnderstudy}>
                                                <SelectTrigger className="h-11 border-amber-200 bg-amber-50/20">
                                                    <SelectValue placeholder="Select understudy..." />
                                                </SelectTrigger>
                                                <SelectContent className="max-h-[200px]">
                                                    {understudies.map(u => <SelectItem key={u.id} value={u.id.toString()}>{u.full_name}</SelectItem>)}
                                                </SelectContent>
                                            </Select>
                                        </TableRow>
                                    )}

                                    {formData.subdepartment_id === SPONSOR_SUBDEPT_ID && (
                                        <TableRow label="Designated Sponsor">
                                            <Popover open={isSponsorPopoverOpen} onOpenChange={setIsSponsorPopoverOpen}>
                                                <PopoverTrigger asChild>
                                                    <Button variant="outline" className="w-full justify-between h-11 border-emerald-100 bg-emerald-50/30 hover:bg-emerald-50">
                                                        {selectedSponsor ? <span className="font-bold text-emerald-700">{selectedSponsor.full_name}</span> : <span className="text-emerald-400">Search for sponsor...</span>}
                                                        <Users className="h-4 w-4 text-emerald-400" />
                                                    </Button>
                                                </PopoverTrigger>
                                                <PopoverContent className="w-[400px] p-0" align="start">
                                                    <Command>
                                                        <CommandInput placeholder="Search sponsors..." />
                                                        <CommandList className="max-h-[300px] overflow-y-auto">
                                                            <CommandEmpty>No sponsors found.</CommandEmpty>
                                                            <CommandGroup>
                                                                {sponsors.map(s => (
                                                                    <CommandItem key={s.id} onSelect={() => { setSelectedSponsor(s); setIsSponsorPopoverOpen(false); }}>
                                                                        <Check className={cn("mr-2 h-4 w-4 text-emerald-600", selectedSponsor?.id === s.id ? "opacity-100" : "opacity-0")} />
                                                                        {s.full_name}
                                                                    </CommandItem>
                                                                ))}
                                                            </CommandGroup>
                                                        </CommandList>
                                                    </Command>
                                                </PopoverContent>
                                            </Popover>
                                        </TableRow>
                                    )}
                                </CardContent>
                            </Card>

                            {/* PROCESS CLASSIFICATION SECTION */}
                            <Card className="border-blue-100 shadow-sm overflow-hidden bg-white mb-4">
                                <CardHeader className="bg-blue-50/50 py-3 px-6 border-b border-blue-100">
                                    <CardTitle className="text-sm font-black text-blue-800 uppercase tracking-wider flex items-center gap-2">
                                        <Shield className="h-4 w-4" />
                                        Process Classification
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-6 space-y-0">
                                    <TableRow label="Department" required>
                                        <Select value={formData.department_id} onValueChange={id => setFormData(prev => ({ ...prev, department_id: id, subdepartment_id: '', class_id: '' }))}>
                                            <SelectTrigger className="h-11 bg-white border-slate-200">
                                                <SelectValue placeholder="Choose Department" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {departments.map(d => <SelectItem key={d.id} value={d.id.toString()}>{d.name}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                    </TableRow>

                                    <TableRow label="Sub-Department">
                                        <Select value={formData.subdepartment_id} onValueChange={id => setFormData(prev => ({ ...prev, subdepartment_id: id, class_id: '' }))} disabled={!formData.department_id}>
                                            <SelectTrigger className="h-11 bg-white border-slate-200">
                                                <SelectValue placeholder="Choose Sub-Department" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {availableSubdepartments.map(s => <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                    </TableRow>

                                    <TableRow label="Service Class">
                                        <Select value={formData.class_id} onValueChange={id => setFormData(prev => ({ ...prev, class_id: id }))} disabled={!formData.subdepartment_id}>
                                            <SelectTrigger className="h-11 bg-white border-slate-200">
                                                <SelectValue placeholder="Choose Service Class" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {availableClasses.map(c => <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                    </TableRow>
                                </CardContent>
                            </Card>

                            {/* INTERNAL PROCESSING SECTION */}
                            <Card className="border-blue-100 shadow-sm overflow-hidden bg-white mb-4">
                                <CardHeader className="bg-blue-50/50 py-3 px-6 border-b border-blue-100">
                                    <CardTitle className="text-sm font-black text-blue-800 uppercase tracking-wider flex items-center gap-2">
                                        <UserCheck className="h-4 w-4" />
                                        Internal Processing
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-6 space-y-0">
                                    <TableRow label="Assigned Officer">
                                        <Select value={formData.officer_id} onValueChange={id => setFormData(prev => ({ ...prev, officer_id: id }))}>
                                            <SelectTrigger className="h-11 bg-white border-slate-200">
                                                <SelectValue placeholder="Select Officer" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {availableOfficers.map(o => <SelectItem key={o.id} value={o.id.toString()}>{o.full_name || o.name}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                    </TableRow>

                                    <TableRow label="Task Manager">
                                        <Select value={formData.task_manager_id} onValueChange={id => setFormData(prev => ({ ...prev, task_manager_id: id }))}>
                                            <SelectTrigger className="h-11 bg-white border-slate-200">
                                                <SelectValue placeholder="Select Manager" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {availableManagers.map(m => <SelectItem key={m.id} value={m.id.toString()}>{m.full_name || m.name}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                    </TableRow>

                                    <TableRow label="Enquiry Date">
                                        <div className="relative max-w-sm">
                                            <Input
                                                type="date"
                                                value={formData.enquiry_date}
                                                onChange={e => setFormData(prev => ({ ...prev, enquiry_date: e.target.value }))}
                                                className="pl-10 h-11 border-slate-200 bg-white"
                                            />
                                            <Calendar className="absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
                                        </div>
                                    </TableRow>
                                </CardContent>
                            </Card>
                        </div>

                        <div className="col-span-1">
                            {/* REQUIREMENT INTELLIGENCE SECTION */}
                            <Card className="border-blue-100 shadow-sm overflow-hidden bg-white mb-4">
                                <CardHeader className="bg-blue-50/50 px-6 border-b border-blue-100">
                                    <CardTitle className="text-sm font-black text-blue-800 uppercase tracking-wider flex items-center gap-2">
                                        <HelpCircle className="h-4 w-4" />
                                        Job Specific Questions
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-6">
                                    {Object.entries(groupedQuestions).length > 0 ? (
                                        <div className="space-y-6">
                                            {Object.entries(groupedQuestions).map(([category, questions]) => (
                                                <div key={category} className="space-y-2">
                                                    <div className="flex items-center gap-2 pb-2 border-b border-slate-200">
                                                        <Folder className="h-4 w-4 text-blue-600" />
                                                        <h3 className="text-sm font-black text-blue-800 uppercase tracking-wider">{category}</h3>
                                                    </div>
                                                    <div className="space-y-0">
                                                        {questions.map((q) => (
                                                            <TableRow key={q.id} label={q.label} required={q.required}>
                                                                {q.type === 'text' && (
                                                                    <Input
                                                                        value={jobAnswers[q.id] || ''}
                                                                        onChange={e => setJobAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                                                                        className="h-11 bg-white border-slate-200"
                                                                    />
                                                                )}

                                                                {q.type === 'boolean' && (
                                                                    <RadioGroup
                                                                        value={jobAnswers[q.id] === undefined ? "" : String(jobAnswers[q.id])}
                                                                        onValueChange={v => setJobAnswers(prev => ({ ...prev, [q.id]: v === 'true' }))}
                                                                        className="flex gap-4"
                                                                    >
                                                                        <div className="flex items-center space-x-2 bg-slate-50 px-4 py-2 rounded-md border border-slate-200">
                                                                            <RadioGroupItem value="true" id={`q-yes-${q.id}`} />
                                                                            <Label htmlFor={`q-yes-${q.id}`} className="text-sm cursor-pointer">Yes</Label>
                                                                        </div>
                                                                        <div className="flex items-center space-x-2 bg-slate-50 px-4 py-2 rounded-md border border-slate-200">
                                                                            <RadioGroupItem value="false" id={`q-no-${q.id}`} />
                                                                            <Label htmlFor={`q-no-${q.id}`} className="text-sm cursor-pointer">No</Label>
                                                                        </div>
                                                                    </RadioGroup>
                                                                )}

                                                                {(q.type === 'select' || q.type === 'multiselect') && (
                                                                    <div className="space-y-2">
                                                                        <Popover>
                                                                            <PopoverTrigger asChild>
                                                                                <Button variant="outline" className="w-full justify-between h-11 bg-white border-slate-200">
                                                                                    <span className="truncate">
                                                                                        {q.type === 'multiselect'
                                                                                            ? (jobAnswers[q.id]?.length > 0 ? `${jobAnswers[q.id].length} Selected` : "Choose multiple...")
                                                                                            : (jobAnswers[q.id] || "Select option...")}
                                                                                    </span>
                                                                                    <ChevronsUpDown className="h-4 w-4 opacity-30" />
                                                                                </Button>
                                                                            </PopoverTrigger>
                                                                            <PopoverContent className="w-[400px] p-0">
                                                                                <Command>
                                                                                    <CommandInput placeholder="Filter..." />
                                                                                    <CommandList className="max-h-[250px] overflow-y-auto">
                                                                                        <CommandGroup>
                                                                                            {q.options?.map(opt => (
                                                                                                <CommandItem key={opt} onSelect={() => {
                                                                                                    if (q.type === 'multiselect') {
                                                                                                        const current = jobAnswers[q.id] || [];
                                                                                                        const next = current.includes(opt) ? current.filter(x => x !== opt) : [...current, opt];
                                                                                                        setJobAnswers(prev => ({ ...prev, [q.id]: next }));
                                                                                                    } else {
                                                                                                        setJobAnswers(prev => ({ ...prev, [q.id]: opt }));
                                                                                                    }
                                                                                                }}>
                                                                                                    <Check className={cn(
                                                                                                        "mr-2 h-4 w-4 text-blue-600",
                                                                                                        q.type === 'multiselect'
                                                                                                            ? jobAnswers[q.id]?.includes(opt) ? "opacity-100" : "opacity-0"
                                                                                                            : jobAnswers[q.id] === opt ? "opacity-100" : "opacity-0"
                                                                                                    )} />
                                                                                                    {opt}
                                                                                                </CommandItem>
                                                                                            ))}
                                                                                        </CommandGroup>
                                                                                    </CommandList>
                                                                                </Command>
                                                                            </PopoverContent>
                                                                        </Popover>

                                                                        {/* Multiselect Badges */}
                                                                        {q.type === 'multiselect' && jobAnswers[q.id]?.length > 0 && (
                                                                            <div className="flex flex-wrap gap-1.5">
                                                                                {jobAnswers[q.id].map(val => (
                                                                                    <Badge key={val} variant="secondary" className="text-xs py-1 px-2 bg-blue-50 text-blue-600 border-blue-100 flex items-center gap-1">
                                                                                        {val}
                                                                                        <X
                                                                                            className="h-3 w-3 cursor-pointer hover:text-blue-800"
                                                                                            onClick={() => setJobAnswers(prev => ({ ...prev, [q.id]: prev[q.id].filter(x => x !== val) }))}
                                                                                        />
                                                                                    </Badge>
                                                                                ))}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </TableRow>
                                                        ))}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="text-center py-12">
                                            <div className="bg-slate-100 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                                                <HelpCircle className="h-8 w-8 text-slate-400" />
                                            </div>
                                            <h3 className="text-lg font-semibold text-slate-700 mb-2">Job Questions Not Loaded</h3>
                                            <p className="text-sm text-slate-500 mb-4">Please select a job level to load requirement-specific questions</p>
                                            <div className="text-xs text-slate-400 bg-slate-50 rounded-lg p-3 max-w-md mx-auto">
                                                <p>Select a Department, Sub-Department, and Service Class to load the relevant job questions for this enquiry.</p>
                                            </div>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>

                            {/* ADDITIONAL REMARKS SECTION */}
                            <Card className="border-blue-100 shadow-sm overflow-hidden bg-white mb-4">
                                <CardHeader className="bg-blue-50/50 py-3 px-6 border-b border-blue-100">
                                    <CardTitle className="text-sm font-black text-blue-800 uppercase tracking-wider flex items-center gap-2">
                                        <FileText className="h-4 w-4" />
                                        Additional Remarks
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-6">
                                    <Textarea
                                        value={formData.job_description}
                                        onChange={e => setFormData(prev => ({ ...prev, job_description: e.target.value }))}
                                        placeholder="Capture additional client context here..."
                                        className="min-h-[120px] bg-white border-slate-200 p-4"
                                    />
                                </CardContent>
                            </Card>
                        </div>
                    </form>
                </ScrollArea>

                {/* STATIC FOOTER */}
                <DialogFooter className="p-6 bg-white border-t border-blue-100 shrink-0 z-10 shadow-[0_-4px_10px_rgba(0,0,0,0.03)]">
                    <div className="flex items-center justify-between w-full">
                        <div className="flex flex-col">
                            <span className="text-xs text-slate-400 font-semibold uppercase tracking-wide">Enquiry Ready</span>
                            <span className="text-sm text-blue-600 font-bold truncate max-w-[400px]">
                                {selectedIndividual?.full_name || "Awaiting Selection"}
                            </span>
                        </div>
                        <div className="flex gap-3">
                            <Button
                                variant="ghost"
                                onClick={() => onOpenChange(false)}
                                disabled={loading}
                                className="px-6 font-semibold uppercase text-xs tracking-wide text-slate-500 hover:text-slate-700"
                            >
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                form="enquiry-form"
                                disabled={loading || !selectedIndividual || !formData.department_id}
                                className="px-10 bg-blue-600 hover:bg-blue-700 h-11 text-white font-bold uppercase text-xs tracking-wide transition-all"
                            >
                                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                                {taskToEdit ? 'Update Enquiry' : 'Finalize Enquiry'}
                            </Button>
                        </div>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}