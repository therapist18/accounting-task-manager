// @ts-nocheck
"use client"

import { useState, useCallback, useMemo, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SearchableSelect } from "@/components/ui/searchable-select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Check, ChevronsUpDown, Loader2, User, Users, Building2, FileText, UserPlus, UserCheck, Shield, HelpCircle, Calendar, MessageSquare, ListTodo, Phone, Database, Folder, Search, HeartHandshake, Split, X, AlertCircle, Link2, PlusCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Textarea } from "@/components/ui/textarea"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Card, CardContent, CardTitle, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import supabase from "@/lib/supabase/client"
import { toast } from "@/lib/hooks/use-toast"
import { format } from "date-fns"
import { ScrollArea } from "@/components/ui/scroll-area"
import { detectExistingWorkflowForIndividual, detectTaskConflictsForJobLevel, evaluateWorkflowRestrictionsForBundle, formatWorkflowRestrictionReason, taskBundleService } from "../utils/workflowBundleHelpers"

const CLASS_D_ID = '1750687058159';
const SPONSOR_SUBDEPT_ID = '26';
const CLIENT_CATEGORIES = ['ACC', 'IMM', 'Sheria', 'Audit'];

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
        auto_assign_value?: string
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

const createInitialCompanyCategories = () =>
    CLIENT_CATEGORIES.reduce((acc, category) => {
        acc[category] = {
            isActive: category === 'IMM',
            wef: '2000-01-01',
            to: category === 'IMM' ? '2050-12-31' : '2000-01-01'
        };
        return acc;
    }, {} as Record<string, { isActive: boolean; wef: string; to: string }>);

const normalizeEnquiryDateForStorage = (dateValue?: string) => {
    if (!dateValue) {
        const today = new Date();
        return {
            isoDateTime: `${today.toISOString().split('T')[0]}T00:00:00.000Z`,
            displayDate: format(today, 'dd/MM/yyyy')
        };
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
        const [year, month, day] = dateValue.split('-');
        return {
            isoDateTime: `${year}-${month}-${day}T00:00:00.000Z`,
            displayDate: `${day}/${month}/${year}`
        };
    }

    const parsedDate = new Date(dateValue);
    if (!isNaN(parsedDate.getTime())) {
        return {
            isoDateTime: `${parsedDate.toISOString().split('T')[0]}T00:00:00.000Z`,
            displayDate: format(parsedDate, 'dd/MM/yyyy')
        };
    }

    const today = new Date();
    return {
        isoDateTime: `${today.toISOString().split('T')[0]}T00:00:00.000Z`,
        displayDate: format(today, 'dd/MM/yyyy')
    };
};

// Moved TableRow outside to prevent re-rendering/focus loss
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
    const [checkingWorkflow, setCheckingWorkflow] = useState(false)

    // Data lists
    const [individuals, setIndividuals] = useState<Individual[]>([])
    const [sponsors, setSponsors] = useState<any[]>([]) // List for sponsors
    const [jobQuestions, setJobQuestions] = useState<JobQuestion[]>([])
    const [jobAnswers, setJobAnswers] = useState<Record<string, any>>({})
    const [masterFieldsData, setMasterFieldsData] = useState<Record<string, any[]>>({})
    const [existingWorkflowSummary, setExistingWorkflowSummary] = useState<any | null>(null)
    const [duplicateTaskConflicts, setDuplicateTaskConflicts] = useState<any[]>([])
    const [selectedJobLevelBundle, setSelectedJobLevelBundle] = useState<any | null>(null)
    const [workflowRestrictionSummary, setWorkflowRestrictionSummary] = useState<any | null>(null)

    // Selection State
    const [applicantType, setApplicantType] = useState<'principal' | 'dependant'>('principal')
    const [selectedIndividual, setSelectedIndividual] = useState<Individual | null>(null)
    const [selectedSponsor, setSelectedSponsor] = useState<any | null>(null) // State for Sponsor
    const [principalForDependant, setPrincipalForDependant] = useState<Individual | null>(null)
    const [companies, setCompanies] = useState<any[]>([])
    const [allCompanies, setAllCompanies] = useState<any[]>([])
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
    const [showCompanyAssociationDialog, setShowCompanyAssociationDialog] = useState(false);
    const [associationLoading, setAssociationLoading] = useState(false);
    const [showCompanyCreateDialog, setShowCompanyCreateDialog] = useState(false);
    const [companySearchTerm, setCompanySearchTerm] = useState('');
    const [newCompanyName, setNewCompanyName] = useState('');
    const [companyCategories, setCompanyCategories] = useState(createInitialCompanyCategories);
    const [newAssociationData, setNewAssociationData] = useState({
        individual_type: '',
        company_id: '',
        effective_start_date: '',
        effective_end_date: '',
        shares_held: ''
    });
    const availableSubdepartments = useMemo(() => {
        const dept = departments.find(d => d.id.toString() === formData.department_id)
        return dept?.tm_subdepartments || []
    }, [formData.department_id, departments])

    const availableClasses = useMemo(() => {
        const sub = availableSubdepartments.find(s => s.id.toString() === formData.subdepartment_id)
        return sub?.classes || []
    }, [availableSubdepartments, formData.subdepartment_id])

    // Create options arrays for SearchableSelect
    const companyOptions = useMemo(() => {
        return companies.map(c => ({ value: c.id.toString(), label: c.company_name }));
    }, [companies]);

    const filteredAssociationCompanies = useMemo(() => {
        const term = companySearchTerm.trim().toLowerCase();
        if (!term) return allCompanies.slice(0, 6);
        return allCompanies
            .filter(company => company.company_name?.toLowerCase().includes(term))
            .slice(0, 6);
    }, [allCompanies, companySearchTerm]);

    const understudyOptions = useMemo(() => {
        return understudies.map(u => ({ value: u.id.toString(), label: u.full_name }));
    }, [understudies]);

    const departmentOptions = useMemo(() => {
        return departments.map(d => ({ value: d.id.toString(), label: d.name }));
    }, [departments]);

    const subdepartmentOptions = useMemo(() => {
        return availableSubdepartments.map(s => ({ value: s.id.toString(), label: s.name }));
    }, [availableSubdepartments]);

    const classOptions = useMemo(() => {
        return availableClasses.map(c => ({ value: c.id.toString(), label: c.name }));
    }, [availableClasses]);

    const officerOptions = useMemo(() => {
        return availableOfficers.map(o => ({ value: o.id.toString(), label: o.full_name || o.name }));
    }, [availableOfficers]);

    const managerOptions = useMemo(() => {
        return availableManagers.map(m => ({ value: m.id.toString(), label: m.full_name || m.name }));
    }, [availableManagers]);

    const assistantOptions = useMemo(() => {
        return availableAssistants.map(a => ({ value: a.id.toString(), label: a.full_name || a.name }));
    }, [availableAssistants]);

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

    const fetchAllCompanies = useCallback(async () => {
        const { data, error } = await supabase
            .from('acc_portal_company_duplicate')
            .select('id, company_name, understudy')
            .order('company_name');

        if (error) throw error;
        setAllCompanies(data || []);
        return data || [];
    }, []);

    const fetchIndividualsByType = useCallback(async (type: 'principal' | 'dependant') => {
        const { data, error } = await supabase
            .from('registry_individuals')
            .select('id, full_name, contact_details, individual_type, relationships, employment_data')
            .eq('individual_type', type)
            .order('full_name');

        if (error) throw error;
        setIndividuals(data || []);
        return data || [];
    }, []);

    const fetchUnderstudies = useCallback(async (companyId: string) => {
        if (!companyId) { setUnderstudies([]); return }
        const { data: companyData } = await supabase.from('acc_portal_company_duplicate').select('understudy').eq('id', companyId).single()
        const understudyList = companyData?.understudy || []
        if (understudyList.length) {
            const { data: inds } = await supabase.from('registry_individuals').select('id, full_name').in('id', understudyList.map((u: any) => u.individual_id))
            setUnderstudies(inds || [])
        }
    }, [])

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
        setExistingWorkflowSummary(null)
        setDuplicateTaskConflicts([])
        setSelectedJobLevelBundle(null)
        setWorkflowRestrictionSummary(null)
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

    // Auto-assignment logic - triggers when any question answer changes
    const handleAutoAssignment = useCallback((changedQuestionId: string, newValue: any) => {
        // Find all questions that depend on the changed question
        const dependentQuestions = jobQuestions.filter(q =>
            q.depends_on?.id === changedQuestionId &&
            q.depends_on?.auto_assign_value
        );

        if (dependentQuestions.length === 0) return;

        const newAnswers = { ...jobAnswers };
        let hasChanges = false;

        dependentQuestions.forEach(q => {
            const parentVal = newValue;
            const targetVal = q.depends_on?.value;
            const assignValue = q.depends_on?.auto_assign_value;

            if (!assignValue) return;

            let shouldAssign = false;

            switch (q.depends_on?.operator) {
                case 'equals':
                    shouldAssign = String(parentVal) === String(targetVal);
                    break;
                case 'not_equals':
                    shouldAssign = String(parentVal) !== String(targetVal);
                    break;
                case 'is_not_empty':
                    if (Array.isArray(parentVal)) {
                        shouldAssign = parentVal.length > 0;
                    } else {
                        shouldAssign = parentVal !== undefined && parentVal !== null && parentVal !== '';
                    }
                    break;
                case 'is_empty':
                    if (Array.isArray(parentVal)) {
                        shouldAssign = parentVal.length === 0;
                    } else {
                        shouldAssign = parentVal === undefined || parentVal === null || parentVal === '';
                    }
                    break;
            }

            if (shouldAssign) {
                newAnswers[q.id] = assignValue;
                hasChanges = true;
            }
        });

        if (hasChanges) {
            setJobAnswers(newAnswers);
        }
    }, [jobQuestions, jobAnswers]);

    const groupedQuestions = useMemo(() => {
        const visible = jobQuestions.filter(q => checkVisibility(q));
        return visible.reduce((acc, q) => {
            const cat = q.category || "General Requirements";
            if (!acc[cat]) acc[cat] = [];
            acc[cat].push(q);
            return acc;
        }, {} as Record<string, JobQuestion[]>);
    }, [jobQuestions, checkVisibility]);


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
            fetchIndividualsByType(applicantType)
                .finally(() => setSearchLoading(false))
        }
    }, [open, applicantType, fetchIndividualsByType])

    useEffect(() => {
        if (!open) return;
        fetchAllCompanies().catch((error) => {
            console.error('Error fetching companies:', error);
            toast({ title: "Load Failed", description: "Failed to load companies.", variant: "destructive" });
        });
    }, [open, fetchAllCompanies])

    // Reset primary applicant field when applicant type changes
    useEffect(() => {
        if (open) {
            setSelectedIndividual(null)
            setSelectedCompany('')
            setSelectedUnderstudy('')
            setUnderstudies([])
            setCompanies([])
            setAvailableDependants([])
            setSelectedDependants([])
            setIncludeDependants(false)
            setAvailableReferences([])
            setSelectedReferences([])
            setIncludeReferences(false)
            setPrincipalForDependant(null)
            setApplicantPhoto(null)
            setSelectedSponsor(null)
        }
    }, [applicantType, open])

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
                        const rel = ind.relationships?.find(r => r.individual_id === f.id)
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

    useEffect(() => {
        let cancelled = false;

        const checkWorkflowState = async () => {
            if (!open || !selectedIndividual?.id) {
                setExistingWorkflowSummary(null);
                setDuplicateTaskConflicts([]);
                setSelectedJobLevelBundle(null);
                setWorkflowRestrictionSummary(null);
                return;
            }

            setCheckingWorkflow(true);
            try {
                const workflowSummary = await detectExistingWorkflowForIndividual(selectedIndividual.id);
                if (!cancelled) {
                    setExistingWorkflowSummary(workflowSummary);
                }

                if (!formData.department_id) {
                    if (!cancelled) {
                        setDuplicateTaskConflicts([]);
                        setSelectedJobLevelBundle(null);
                        setWorkflowRestrictionSummary(null);
                    }
                    return;
                }

                const selectedJobLevel = {
                    level: formData.class_id ? 3 : formData.subdepartment_id ? 2 : 1,
                    department_id: formData.department_id ? Number(formData.department_id) : null,
                    subdepartment_id: formData.subdepartment_id ? Number(formData.subdepartment_id) : null,
                    class_id: formData.class_id ? Number(formData.class_id) : null,
                    subclass_id: null,
                };

                const bundle = await taskBundleService.fetchForJobLevel(selectedJobLevel);
                const restrictionSummary = evaluateWorkflowRestrictionsForBundle(workflowSummary?.workflowLogs || [], bundle);

                const conflicts = await detectTaskConflictsForJobLevel(selectedIndividual.id, {
                    ...selectedJobLevel,
                });

                if (!cancelled) {
                    const filteredConflicts = taskToEdit
                        ? conflicts.filter((task: any) => String(task.id) !== String(taskToEdit.id))
                        : conflicts;
                    setSelectedJobLevelBundle(bundle);
                    setWorkflowRestrictionSummary(restrictionSummary);
                    setDuplicateTaskConflicts(filteredConflicts);
                }
            } catch (error) {
                console.error("[EnquiryDialog] workflow/task conflict check failed", error);
                if (!cancelled) {
                    setExistingWorkflowSummary(null);
                    setDuplicateTaskConflicts([]);
                    setSelectedJobLevelBundle(null);
                    setWorkflowRestrictionSummary(null);
                }
            } finally {
                if (!cancelled) setCheckingWorkflow(false);
            }
        };

        checkWorkflowState();
        return () => {
            cancelled = true;
        };
    }, [open, selectedIndividual?.id, formData.department_id, formData.subdepartment_id, formData.class_id, taskToEdit?.id]);

    useEffect(() => {
        if (!open) return;

        const reloadSelectedIndividual = async (individualId?: number | string | null) => {
            if (!individualId) return;

            const { data, error } = await supabase
                .from('registry_individuals')
                .select('id, full_name, contact_details, individual_type, relationships, employment_data')
                .eq('id', individualId)
                .single();

            if (!error && data) {
                await handleIndividualSelect(data);
            }
        };

        const individualChannel = supabase
            .channel(`enquiry-registry-individuals:${applicantType}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'registry_individuals'
            }, async (payload) => {
                await fetchIndividualsByType(applicantType);

                const changedId = payload.new?.id || payload.old?.id;
                if (selectedIndividual?.id && String(changedId) === String(selectedIndividual.id)) {
                    await reloadSelectedIndividual(selectedIndividual.id);
                }
            })
            .subscribe();

        const companyChannel = supabase
            .channel('enquiry-company-duplicate')
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'acc_portal_company_duplicate'
            }, async () => {
                await fetchAllCompanies();

                if (selectedIndividual) {
                    await reloadSelectedIndividual(selectedIndividual.id);
                }
            })
            .subscribe();

        return () => {
            supabase.removeChannel(individualChannel);
            supabase.removeChannel(companyChannel);
        };
    }, [open, applicantType, selectedIndividual, fetchIndividualsByType, fetchAllCompanies, handleIndividualSelect]);

    // --- New Handler: Clear Company Selection ---
    const handleClearCompany = () => {
        setSelectedCompany('');
        setUnderstudies([]);
        setSelectedUnderstudy('');
    }

    const resetCompanyCreationState = useCallback(() => {
        setNewCompanyName('');
        setCompanyCategories(createInitialCompanyCategories());
    }, []);

    const handleOpenCompanyCreateDialog = useCallback((companyName: string) => {
        setNewCompanyName(companyName);
        setShowCompanyCreateDialog(true);
    }, []);

    const handleCompanyCategoryChange = useCallback((category: string, field: 'isActive' | 'wef' | 'to', value: any) => {
        setCompanyCategories(prev => ({
            ...prev,
            [category]: {
                ...prev[category],
                [field]: value
            }
        }));
    }, []);

    const handleCreateCompany = useCallback(async () => {
        const trimmedName = newCompanyName.trim();
        if (!trimmedName) {
            toast({ title: "Missing Company Name", description: "Please provide a company name.", variant: "destructive" });
            return;
        }

        setAssociationLoading(true);
        try {
            const payload = {
                company_name: trimmedName,
                ...Object.keys(companyCategories).reduce((acc, category) => {
                    const categoryData = companyCategories[category];
                    if (categoryData?.isActive) {
                        acc[`${category.toLowerCase()}_client_effective_from`] = categoryData.wef || '01/01/2000';
                        acc[`${category.toLowerCase()}_client_effective_to`] = categoryData.to || '01/01/2000';
                    }
                    return acc;
                }, {} as Record<string, string>)
            };

            const { data, error } = await supabase
                .from('acc_portal_company_duplicate')
                .insert(payload)
                .select('id, company_name, understudy')
                .single();

            if (error) throw error;

            const nextCompanies = [...allCompanies, data].sort((a, b) =>
                (a.company_name || '').localeCompare(b.company_name || '')
            );
            setAllCompanies(nextCompanies);
            setNewAssociationData(prev => ({ ...prev, company_id: String(data.id) }));
            setCompanySearchTerm(data.company_name || '');

            toast({
                title: "Company Created",
                description: `Successfully created "${trimmedName}".`,
                variant: "success"
            });

            setShowCompanyCreateDialog(false);
            resetCompanyCreationState();
        } catch (error) {
            console.error('Error creating company:', error);
            toast({
                title: "Creation Failed",
                description: error.message || "Failed to create company.",
                variant: "destructive"
            });
        } finally {
            setAssociationLoading(false);
        }
    }, [newCompanyName, companyCategories, allCompanies, resetCompanyCreationState]);

    useEffect(() => {
        if (!showCompanyAssociationDialog) {
            setCompanySearchTerm('');
            setNewAssociationData({
                individual_type: '',
                company_id: '',
                effective_start_date: '',
                effective_end_date: '',
                shares_held: ''
            });
        }
    }, [showCompanyAssociationDialog]);

    useEffect(() => {
        if (!newAssociationData.company_id || newAssociationData.company_id === 'unallocated') return;
        const selected = allCompanies.find(company => String(company.id) === String(newAssociationData.company_id));
        if (selected?.company_name) {
            setCompanySearchTerm(selected.company_name);
        }
    }, [newAssociationData.company_id, allCompanies]);

    // --- New Handler: Create Company Association ---
    const handleCreateCompanyAssociation = async () => {
        if (!selectedIndividual || !newAssociationData.individual_type || !newAssociationData.company_id) {
            toast({ title: "Missing Information", description: "Please fill in all required fields.", variant: "destructive" });
            return;
        }

        setAssociationLoading(true);
        try {
            const associationPayload = {
                individual_type: newAssociationData.individual_type,
                company_id: newAssociationData.company_id === 'unallocated' ? null : String(newAssociationData.company_id),
                is_current: true,
                role: ['Director', 'Employee', 'Shareholder'].includes(newAssociationData.individual_type)
                    ? newAssociationData.individual_type
                    : undefined,
            };

            // Add effective dates for applicable roles
            if (['Principal', 'Director', 'Employee', 'Shareholder'].includes(newAssociationData.individual_type)) {
                if (newAssociationData.effective_start_date) {
                    associationPayload.effective_start_date = newAssociationData.effective_start_date;
                }
                if (newAssociationData.effective_end_date) {
                    associationPayload.effective_end_date = newAssociationData.effective_end_date;
                }
            }

            // Add shares held for shareholders
            if (newAssociationData.individual_type === 'Shareholder' && newAssociationData.shares_held) {
                associationPayload.shares_held = parseInt(newAssociationData.shares_held, 10);
            }

            // Call the RPC function to add association
            const { error: rpcError } = await supabase.rpc('add_individual_association', {
                p_individual_id: selectedIndividual.id,
                p_new_association: associationPayload
            });

            if (rpcError) throw rpcError;

            // Refresh the individual's data to get updated companies
            await handleIndividualSelect(selectedIndividual);

            // If the newly associated company is not 'unallocated', update the selected company
            if (newAssociationData.company_id !== 'unallocated') {
                setSelectedCompany(newAssociationData.company_id);
                // Fetch understudies for the newly associated company
                await fetchUnderstudies(newAssociationData.company_id);
            }

            toast({
                title: "Association Created",
                description: `Successfully linked ${selectedIndividual.full_name} to the company.`,
                variant: "success"
            });

            // Close dialog and reset form
            setShowCompanyAssociationDialog(false);
            setNewAssociationData({
                individual_type: '',
                company_id: '',
                effective_start_date: '',
                effective_end_date: '',
                shares_held: ''
            });

        } catch (error) {
            console.error('Error creating association:', error);
            toast({
                title: "Association Failed",
                description: error.message || "Failed to create company association.",
                variant: "destructive"
            });
        } finally {
            setAssociationLoading(false);
        }
    }

    const handleSubmit = async () => {
        if (!selectedIndividual || !formData.department_id) return

        if (!taskToEdit && duplicateTaskConflicts.length > 0) {
            toast({
                title: "Duplicate task detected",
                description: "An active task already exists for this applicant and selected job level.",
                variant: "destructive"
            })
            return
        }

        if (!taskToEdit && workflowRestrictionSummary?.hasBlockingWorkflow) {
            toast({
                title: "Workflow restriction detected",
                description: "The related document workflow is in a blocking state for this job level.",
                variant: "destructive"
            })
            return
        }

        setLoading(true)
        try {
            const normalizedEnquiryDate = normalizeEnquiryDateForStorage(formData.enquiry_date);
            const participants: any[] = []

            // Extract Participant Details
            if (selectedCompany) {
                const c = companies.find(x => x.id.toString() === selectedCompany)
                if (c) participants.push({ id: c.id, name: c.company_name, role: ['company'], type: "company" })
            }
            // 2. Understudy (Specific to Class D)
            if (selectedUnderstudy && formData.class_id === CLASS_D_ID) {
                const u = understudies.find(x => x.id.toString() === selectedUnderstudy)
                if (u) participants.push({ id: u.id, name: u.full_name, role: ['understudy'], type: "individual" })
            }

            // 3. Selected Dependants (If Principal is applicant)
            if (applicantType === 'principal' && selectedDependants.length > 0) {
                selectedDependants.forEach(depId => {
                    const dep = availableDependants.find(d => d.id.toString() === depId);
                    if (dep) {
                        participants.push({
                            id: dep.id,
                            name: dep.full_name,
                            role: ['dependant', dep.relationship_type?.toLowerCase()],
                            type: "individual"
                        });
                    }
                });
            }

            // 4. Principal Link (If Dependant is applicant)
            if (applicantType === 'dependant' && principalForDependant) {
                participants.push({
                    id: principalForDependant.id,
                    name: principalForDependant.full_name,
                    role: ['principal'],
                    type: "individual"
                });
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
                toast({ title: "Success", description: "Enquiry updated successfully.", variant: "success" });
            } else {
                // INSERT
                const insertPayload = {
                    ...payload,
                    status: 'enquiry',
                    date_initiated: normalizedEnquiryDate.isoDateTime,
                    applied_by: "11",
                    created_by: "enquiry_dialog",
                    job_level: {
                        level: formData.class_id ? 3 : formData.subdepartment_id ? 2 : 1,
                        department_id: Number(formData.department_id),
                        subdepartment_id: formData.subdepartment_id ? Number(formData.subdepartment_id) : null,
                        class_id: formData.class_id ? Number(formData.class_id) : null,
                        subclass_id: null
                    },
                    registry_metadata: {
                        triggered_from: "enquiry_dialog",
                        triggered_at: new Date().toISOString(),
                        existing_workflow_detected: !!workflowRestrictionSummary?.matchedDocumentTypes?.length,
                        workflow_blocking_reasons: workflowRestrictionSummary?.blockingReasons || []
                    },
                    stages: { '1e6ebd85-db1e-4eb9-abb6-5fc145ac8caa': { status: "completed", date: normalizedEnquiryDate.displayDate } }
                };
                const { data, error } = await supabase.from('tm_tasks').insert([insertPayload]).select().single();
                if (error) throw error;
                result = data;
                toast({ title: "Success", description: "Enquiry created successfully.", variant: "success" });
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

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="max-w-[1600px] max-h-[95vh] p-0 flex flex-col border-none shadow-2xl bg-white">
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
                    <div className="flex-1 w-full h-full bg-slate-50/50 overflow-auto">
                        <div className="p-6 space-y-4 grid grid-cols-2 gap-4">
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
                                                {/* Photo Preview - UPDATED FOR PDF */}
                                                <div className="shrink-0">
                                                    {loadingPhoto ? (
                                                        <div className="w-16 h-16 rounded-lg bg-slate-100 flex items-center justify-center">
                                                            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                                                        </div>
                                                    ) : applicantPhoto ? (
                                                        isApplicantPhotoPdf ? (
                                                            <iframe
                                                                src={`${applicantPhoto}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
                                                                className="w-16 h-16 rounded-lg object-cover border-2 border-blue-100 overflow-hidden bg-white"
                                                                title="Applicant Document"
                                                                scrolling="no"
                                                            />
                                                        ) : (
                                                            <img
                                                                src={applicantPhoto}
                                                                alt="Applicant"
                                                                className="w-16 h-16 rounded-lg object-cover border-2 border-blue-100"
                                                            />
                                                        )
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
                                                        <PopoverContent className="w-[400px] p-0 max-h-[400px]" align="start">
                                                            <Command className="h-full rounded-lg border shadow-md">
                                                                <CommandInput placeholder="Search name..." />
                                                                <CommandList
                                                                    className="max-h-[350px] overflow-y-auto overscroll-contain"
                                                                    onWheel={(e) => e.stopPropagation()}
                                                                >
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

                                        <TableRow label="Company Associated">
                                            <div className="flex items-center gap-2 w-full">
                                                <div className="flex-1">
                                                    <SearchableSelect
                                                        value={selectedCompany}
                                                        onValueChange={handleCompanyChange}
                                                        options={[{ value: 'no_company', label: 'No Company Associated' }, ...companyOptions]}
                                                        placeholder="Select Company..."
                                                        disabled={companyOptions.length === 0}
                                                        emptyMessage="No companies found."
                                                        searchPlaceholder="Search company..."
                                                        buttonClassName="h-11 border-slate-200 bg-white w-full"
                                                        popoverClassName="w-[--radix-popover-trigger-width]"
                                                    />
                                                </div>
                                                {/* CLEAR BUTTON FOR COMPANY */}
                                                {selectedCompany && selectedCompany !== 'no_company' && (
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={handleClearCompany}
                                                        className="h-10 w-10 text-slate-400 hover:text-red-500 hover:bg-red-50"
                                                        type="button"
                                                    >
                                                        <X className="h-4 w-4" />
                                                        <span className="sr-only">Clear Company</span>
                                                    </Button>
                                                )}
                                                {/* ASSOCIATE TO COMPANY BUTTON */}
                                                {selectedIndividual && (selectedCompany === 'no_company' || !selectedCompany) && (
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => setShowCompanyAssociationDialog(true)}
                                                        className="h-10 px-3 border-blue-200 text-blue-600 hover:bg-blue-50"
                                                        type="button"
                                                    >
                                                        <Link2 className="h-4 w-4 mr-1" />
                                                        Associate
                                                    </Button>
                                                )}
                                            </div>
                                            {/* Show no company message */}
                                            {selectedCompany === 'no_company' && (
                                                <div className="mt-2 text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded">
                                                    This individual has no company association. Click "Associate" to link them to a company.
                                                </div>
                                            )}
                                        </TableRow>

                                        {/* RELATIONSHIP LOGIC: Rendering Principal or Dependants */}
                                        {selectedIndividual && applicantType === 'principal' && (
                                            <TableRow label="Include Dependants">
                                                {loadingRelations ? (
                                                    <div className="flex items-center gap-2 text-slate-400 text-xs italic"><Loader2 className="h-3 w-3 animate-spin" /> Loading dependants...</div>
                                                ) : availableDependants.length > 0 ? (
                                                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 space-y-2">
                                                        {availableDependants.map(dep => (
                                                            <div key={dep.id} className="flex items-center space-x-2">
                                                                <Checkbox
                                                                    id={`dep-${dep.id}`}
                                                                    checked={selectedDependants.includes(dep.id.toString())}
                                                                    onCheckedChange={(checked) => {
                                                                        setSelectedDependants(prev =>
                                                                            checked ? [...prev, dep.id.toString()] : prev.filter(id => id !== dep.id.toString())
                                                                        )
                                                                    }}
                                                                />
                                                                <Label htmlFor={`dep-${dep.id}`} className="text-xs font-medium cursor-pointer">
                                                                    {dep.full_name} <span className="text-[10px] text-slate-400 uppercase ml-1">({dep.relationship_type})</span>
                                                                </Label>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <div className="text-xs text-slate-500 bg-slate-50 p-3 rounded-lg border border-slate-100 italic">
                                                        No dependants associated with this principal.
                                                    </div>
                                                )}
                                            </TableRow>
                                        )}

                                        {selectedIndividual && applicantType === 'dependant' && (
                                            <TableRow label="Linked Principal">
                                                {loadingRelations ? (
                                                    <div className="flex items-center gap-2 text-slate-400 text-xs italic"><Loader2 className="h-3 w-3 animate-spin" /> Loading principal...</div>
                                                ) : principalForDependant ? (
                                                    <div className="flex items-center gap-2">
                                                        <Badge variant="outline" className="py-2 px-3 border-blue-200 bg-blue-50 text-blue-700 flex items-center gap-2">
                                                            <UserCheck className="h-3 w-3" />
                                                            {principalForDependant.full_name}
                                                        </Badge>
                                                        {/* CLEAR BUTTON FOR LINKED PRINCIPAL */}
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            onClick={() => setPrincipalForDependant(null)}
                                                            className="h-8 w-8 rounded-full text-slate-400 hover:text-red-500 hover:bg-red-50"
                                                            type="button"
                                                            title="Remove Linked Principal"
                                                        >
                                                            <X className="h-3 w-3" />
                                                            <span className="sr-only">Remove Principal</span>
                                                        </Button>
                                                    </div>
                                                ) : (
                                                    <div className="text-xs text-slate-500 bg-slate-50 p-3 rounded-lg border border-slate-100 italic">
                                                        No principal associated (or selected) with this dependant.
                                                    </div>
                                                )}
                                            </TableRow>
                                        )}

                                        {selectedIndividual && (
                                            <TableRow label="Workflow Check">
                                                <div className="space-y-2">
                                                    {checkingWorkflow ? (
                                                        <div className="flex items-center gap-2 text-slate-400 text-xs italic">
                                                            <Loader2 className="h-3 w-3 animate-spin" />
                                                            Checking existing workflows and active tasks...
                                                        </div>
                                                    ) : duplicateTaskConflicts.length > 0 ? (
                                                        <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                                                            <div className="flex items-start gap-2">
                                                                <AlertCircle className="mt-0.5 h-4 w-4 text-red-600" />
                                                                <div className="space-y-1 text-xs text-red-700">
                                                                    <p className="font-semibold">Active task already exists for this job level.</p>
                                                                    {duplicateTaskConflicts.slice(0, 3).map((conflict: any) => (
                                                                        <p key={conflict.id}>
                                                                            #{conflict.id} · {conflict.job_description || "Untitled task"} · {conflict.status}
                                                                        </p>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ) : duplicateTaskConflicts.length === 0 && workflowRestrictionSummary?.hasBlockingWorkflow ? (
                                                        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                                                            Workflow restriction detected for this selected job level.
                                                            {` Blocking state(s): ${(workflowRestrictionSummary.blockingReasons || []).map(formatWorkflowRestrictionReason).join(", ")}.`}
                                                        </div>
                                                    ) : formData.department_id && selectedJobLevelBundle && workflowRestrictionSummary?.matchedDocumentTypes?.length > 0 ? (
                                                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
                                                            Workflow history exists for this selected job level.
                                                            {` ${workflowRestrictionSummary.matchedDocumentTypes.length} related workflow target(s) detected for the matched bundle, including pushed-only task workflow states.`}
                                                        </div>
                                                    ) : (
                                                        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700">
                                                            {formData.department_id
                                                                ? "No workflow or active task conflict detected for the selected job level."
                                                                : "Select a job level to run the workflow check."}
                                                        </div>
                                                    )}
                                                </div>
                                            </TableRow>
                                        )}

                                        {formData.class_id === CLASS_D_ID && (
                                            <TableRow label="Related Understudy" required>
                                                {loadingRelations ? (
                                                    <div className="flex items-center gap-2 text-slate-400 text-xs italic"><Loader2 className="h-3 w-3 animate-spin" /> Loading available understudies...</div>
                                                ) : understudies.length > 0 ? (
                                                    <SearchableSelect
                                                        value={selectedUnderstudy}
                                                        onValueChange={setSelectedUnderstudy}
                                                        options={understudyOptions}
                                                        placeholder="Select understudy..."
                                                        disabled={understudyOptions.length === 0}
                                                        emptyMessage="No understudies found."
                                                        searchPlaceholder="Search understudy..."
                                                        buttonClassName="h-11 border-amber-200 bg-amber-50/20"
                                                        popoverClassName="w-[--radix-popover-trigger-width]"
                                                        allowClear={true}
                                                    />
                                                ) : (
                                                    <div className="text-xs text-amber-600 bg-amber-50 p-2 rounded border border-amber-100 italic">
                                                        No understudies linked to the selected company.
                                                    </div>
                                                )}
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
                                                    <PopoverContent className="w-[400px] p-0 max-h-[400px]" align="start">
                                                        <Command className="rounded-lg border shadow-md">
                                                            <CommandInput placeholder="Search sponsors..." />
                                                            <CommandList
                                                                className="max-h-[350px] overflow-y-auto overscroll-contain"
                                                                onWheel={(e) => e.stopPropagation()}
                                                            >
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
                                            <SearchableSelect
                                                value={formData.department_id}
                                                onValueChange={id => setFormData(prev => ({ ...prev, department_id: id, subdepartment_id: '', class_id: '' }))}
                                                options={departmentOptions}
                                                placeholder="Choose Department"
                                                disabled={departmentOptions.length === 0}
                                                emptyMessage="No departments found."
                                                searchPlaceholder="Search department..."
                                                buttonClassName="h-11 bg-white border-slate-200"
                                                popoverClassName="w-[--radix-popover-trigger-width]"
                                                allowClear={true}
                                            />
                                        </TableRow>

                                        <TableRow label="Sub-Department">
                                            <SearchableSelect
                                                value={formData.subdepartment_id}
                                                onValueChange={id => setFormData(prev => ({ ...prev, subdepartment_id: id, class_id: '' }))}
                                                options={subdepartmentOptions}
                                                placeholder="Choose Sub-Department"
                                                disabled={!formData.department_id || subdepartmentOptions.length === 0}
                                                emptyMessage="No sub-departments found."
                                                searchPlaceholder="Search sub-department..."
                                                buttonClassName="h-11 bg-white border-slate-200"
                                                popoverClassName="w-[--radix-popover-trigger-width]"
                                                allowClear={true}
                                            />
                                        </TableRow>

                                        <TableRow label="Service Class">
                                            <SearchableSelect
                                                value={formData.class_id}
                                                onValueChange={id => setFormData(prev => ({ ...prev, class_id: id }))}
                                                options={classOptions}
                                                placeholder="Choose Service Class"
                                                disabled={!formData.subdepartment_id || classOptions.length === 0}
                                                emptyMessage="No service classes found."
                                                searchPlaceholder="Search service class..."
                                                buttonClassName="h-11 bg-white border-slate-200"
                                                popoverClassName="w-[--radix-popover-trigger-width]"
                                                allowClear={true}
                                            />
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
                                            <SearchableSelect
                                                value={formData.officer_id}
                                                onValueChange={id => setFormData(prev => ({ ...prev, officer_id: id }))}
                                                options={officerOptions}
                                                placeholder="Select Officer"
                                                disabled={officerOptions.length === 0}
                                                emptyMessage="No officers found."
                                                searchPlaceholder="Search officer..."
                                                buttonClassName="h-11 bg-white border-slate-200"
                                                popoverClassName="w-[--radix-popover-trigger-width]"
                                                allowClear={true}
                                            />
                                        </TableRow>

                                        <TableRow label="Task Manager">
                                            <SearchableSelect
                                                value={formData.task_manager_id}
                                                onValueChange={id => setFormData(prev => ({ ...prev, task_manager_id: id }))}
                                                options={managerOptions}
                                                placeholder="Select Manager"
                                                disabled={managerOptions.length === 0}
                                                emptyMessage="No managers found."
                                                searchPlaceholder="Search manager..."
                                                buttonClassName="h-11 bg-white border-slate-200"
                                                popoverClassName="w-[--radix-popover-trigger-width]"
                                                allowClear={true}
                                            />
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
                        </div>
                    </div>

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
                                    onClick={handleSubmit}
                                    disabled={loading || !selectedIndividual || !formData.department_id}
                                    className="px-10 bg-blue-600 hover:bg-blue-700 h-11 text-white font-bold uppercase text-xs tracking-wide transition-all"
                                >
                                    {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                                    {taskToEdit ? 'Update Enquiry' : 'Finalize Enquiry'}
                                </Button>
                            </div>
                        </div>
                    </DialogFooter>
                </DialogContent >
            </Dialog >

            {/* Company Association Dialog */}
            < Dialog open={showCompanyAssociationDialog} onOpenChange={setShowCompanyAssociationDialog} >
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Link2 className="h-5 w-5 text-blue-600" />
                            Associate Individual to Company
                        </DialogTitle>
                        <DialogDescription>
                            Link {selectedIndividual?.full_name} to a company with specified role and details.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        {/* Individual Type */}
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="individual_type" className="">Role Type</Label>
                            <div className="col-span-3">
                                <Select
                                    value={newAssociationData.individual_type}
                                    onValueChange={(value) => setNewAssociationData(prev => ({ ...prev, individual_type: value }))}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select role type..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Principal">Principal</SelectItem>
                                        <SelectItem value="Director">Director</SelectItem>
                                        <SelectItem value="Employee">Employee</SelectItem>
                                        <SelectItem value="Shareholder">Shareholder</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        {/* Company Selection */}
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="company" className="">Company</Label>
                            <div className="col-span-3">
                                <div className="space-y-3">
                                    <div className="relative">
                                        <Input
                                            placeholder="Search existing company or type new company name..."
                                            value={companySearchTerm}
                                            onChange={(e) => {
                                                setCompanySearchTerm(e.target.value);
                                                setNewAssociationData(prev => ({ ...prev, company_id: '' }));
                                            }}
                                        />

                                        {companySearchTerm.trim() && (
                                            <div className="absolute top-full left-0 right-0 z-50 mt-1 overflow-y-auto rounded-md border border-gray-200 bg-white shadow-lg max-h-60">
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setNewAssociationData(prev => ({ ...prev, company_id: 'unallocated' }));
                                                        setCompanySearchTerm('Un-allocated Company');
                                                    }}
                                                    className="flex w-full items-center gap-2 border-b border-gray-100 px-3 py-2 text-left hover:bg-slate-50"
                                                >
                                                    <Building2 className="h-4 w-4 text-slate-500" />
                                                    <span className="text-sm">Un-allocated Company</span>
                                                    <Badge variant="secondary" className="ml-auto text-xs">Special</Badge>
                                                </button>

                                                {filteredAssociationCompanies.map(company => (
                                                    <button
                                                        key={company.id}
                                                        type="button"
                                                        onClick={() => {
                                                            setNewAssociationData(prev => ({ ...prev, company_id: String(company.id) }));
                                                            setCompanySearchTerm(company.company_name);
                                                        }}
                                                        className="flex w-full items-center gap-2 border-b border-gray-100 px-3 py-2 text-left hover:bg-gray-100 last:border-b-0"
                                                    >
                                                        <Building2 className="h-4 w-4 text-gray-500" />
                                                        <span className="text-sm">{company.company_name}</span>
                                                        <Badge variant="secondary" className="ml-auto text-xs">Existing</Badge>
                                                    </button>
                                                ))}

                                                {!allCompanies.some(company =>
                                                    company.company_name?.toLowerCase() === companySearchTerm.trim().toLowerCase()
                                                ) && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleOpenCompanyCreateDialog(companySearchTerm.trim())}
                                                        className="flex w-full items-center gap-2 bg-blue-50 px-3 py-2 text-left hover:bg-blue-100"
                                                    >
                                                        <PlusCircle className="h-4 w-4 text-blue-600" />
                                                        <span className="text-sm font-medium text-blue-800">Create "{companySearchTerm.trim()}"</span>
                                                        <Badge variant="default" className="ml-auto bg-blue-600 text-xs">New</Badge>
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    {newAssociationData.company_id && (
                                        <div className="rounded-lg border border-green-200 bg-green-50 p-3">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <Building2 className="h-4 w-4 text-green-600" />
                                                    <span className="text-sm font-medium text-green-800">
                                                        {newAssociationData.company_id === 'unallocated'
                                                            ? 'Un-allocated Company'
                                                            : (allCompanies.find(company => String(company.id) === String(newAssociationData.company_id))?.company_name || companySearchTerm)}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <Badge variant="default" className="bg-green-600 text-xs">Selected</Badge>
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => {
                                                            setNewAssociationData(prev => ({ ...prev, company_id: '' }));
                                                            setCompanySearchTerm('');
                                                        }}
                                                        className="h-6 w-6 p-0 text-gray-500 hover:text-red-600"
                                                    >
                                                        <X className="h-3 w-3" />
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Effective Dates - Show for applicable roles */}
                        {['Principal', 'Director', 'Employee', 'Shareholder'].includes(newAssociationData.individual_type) && (
                            <>
                                <div className="grid grid-cols-4 items-center gap-4">
                                    <Label htmlFor="effective_start_date" className="">Effective From</Label>
                                    <div className="col-span-3">
                                        <Input
                                            id="effective_start_date"
                                            type="date"
                                            value={newAssociationData.effective_start_date}
                                            onChange={(e) => setNewAssociationData(prev => ({ ...prev, effective_start_date: e.target.value }))}
                                            placeholder="DD/MM/YYYY"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-4 items-center gap-4">
                                    <Label htmlFor="effective_end_date" className="">Effective To</Label>
                                    <div className="col-span-3">
                                        <Input
                                            id="effective_end_date"
                                            type="date"
                                            value={newAssociationData.effective_end_date}
                                            onChange={(e) => setNewAssociationData(prev => ({ ...prev, effective_end_date: e.target.value }))}
                                            placeholder="DD/MM/YYYY (optional)"
                                        />
                                    </div>
                                </div>
                            </>
                        )}

                        {/* Shares Held - Show for Shareholder */}
                        {newAssociationData.individual_type === 'Shareholder' && (
                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="shares_held" className="">Shares Held</Label>
                                <div className="col-span-3">
                                    <Input
                                        id="shares_held"
                                        type="number"
                                        value={newAssociationData.shares_held}
                                        onChange={(e) => setNewAssociationData(prev => ({ ...prev, shares_held: e.target.value }))}
                                        placeholder="e.g., 1000"
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setShowCompanyAssociationDialog(false)}
                            disabled={associationLoading}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleCreateCompanyAssociation}
                            disabled={associationLoading || !newAssociationData.individual_type || !newAssociationData.company_id}
                        >
                            {associationLoading ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Creating Association...
                                </>
                            ) : (
                                <>
                                    <Link2 className="mr-2 h-4 w-4" />
                                    Create Association
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={showCompanyCreateDialog} onOpenChange={setShowCompanyCreateDialog}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <PlusCircle className="h-5 w-5 text-blue-600" />
                            Create Company
                        </DialogTitle>
                        <DialogDescription>
                            Create a new company using the same client-category setup used in quick add.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-5 py-2">
                        <div className="space-y-2">
                            <Label htmlFor="new-company-name">Company Name</Label>
                            <Input
                                id="new-company-name"
                                value={newCompanyName}
                                onChange={(e) => setNewCompanyName(e.target.value)}
                                placeholder="Enter company name..."
                            />
                        </div>

                        <div className="space-y-4">
                            <Label>Client Categories</Label>
                            <div className="space-y-3">
                                {CLIENT_CATEGORIES.map((category) => (
                                    <div key={category} className="rounded-lg border p-4">
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="flex items-center gap-3">
                                                <Checkbox
                                                    checked={companyCategories[category]?.isActive || false}
                                                    onCheckedChange={(checked) => handleCompanyCategoryChange(category, 'isActive', Boolean(checked))}
                                                />
                                                <span className="font-medium text-slate-800">{category}</span>
                                            </div>
                                            <Badge variant={companyCategories[category]?.isActive ? "default" : "secondary"}>
                                                {companyCategories[category]?.isActive ? "Active" : "Inactive"}
                                            </Badge>
                                        </div>

                                        <div className="mt-3 grid grid-cols-2 gap-3">
                                            <div className="space-y-1">
                                                <Label className="text-xs text-slate-500">Effective From</Label>
                                                <Input
                                                    type="date"
                                                    value={companyCategories[category]?.wef || ''}
                                                    onChange={(e) => handleCompanyCategoryChange(category, 'wef', e.target.value)}
                                                    disabled={!companyCategories[category]?.isActive}
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="text-xs text-slate-500">Effective To</Label>
                                                <Input
                                                    type="date"
                                                    value={companyCategories[category]?.to || ''}
                                                    onChange={(e) => handleCompanyCategoryChange(category, 'to', e.target.value)}
                                                    disabled={!companyCategories[category]?.isActive}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => {
                                setShowCompanyCreateDialog(false);
                                resetCompanyCreationState();
                            }}
                            disabled={associationLoading}
                        >
                            Cancel
                        </Button>
                        <Button onClick={handleCreateCompany} disabled={associationLoading || !newCompanyName.trim()}>
                            {associationLoading ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Creating Company...
                                </>
                            ) : (
                                <>
                                    <PlusCircle className="mr-2 h-4 w-4" />
                                    Create Company
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}
