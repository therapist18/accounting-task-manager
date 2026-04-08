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
import { Check, ChevronsUpDown, User, Users, Building2, Loader2, FileText, Briefcase, Shield, Info, Search, X, Calendar, ListTodo, HelpCircle, Folder } from "lucide-react"
import { cn } from "@/lib/utils"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { supabase } from "@/lib/supabase/client"
import { toast } from "@/lib/hooks/use-toast"
import { format } from "date-fns"
import { ScrollArea } from "@/components/ui/scroll-area"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { getInheritedOfficer } from "../../departments/departments/database"
import { fetchAuthOfficers, normalizeAuthOfficer } from "../utils/authOfficers"
import { fetchUserAssignmentData, hasJobLevelAccess } from "../utils/userAssignmentService"

// Photo document IDs
const COMPANY_LOGO_ID = 'f7a75607-bff9-4995-8bde-0256e86da435';
const PASSPORT_PHOTO_ID = '48f48255-e5db-4944-8864-6f35b3af4696';
const CLEAR_PHOTO_ID = 'fa74ff82-09ce-418d-8985-174158d73316';

interface Company {
    id: number
    company_name: string
}

interface Official {
    id: number
    full_name: string
    is_current: boolean
    roles: string[] // Changed to array to handle multiple roles
    primary_role: string
    photoUrl?: string // Add photo URL to interface
}

interface NewCompanyInquiryDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onEnquiryCreated: (enquiries: any[]) => void
    departments: any[]
    selectedDepartmentId?: string
    selectedSubdepartmentId?: string
    selectedClassId?: string
    users: any[]
    officers: any[]
    initialData?: any
}

export function NewCompanyInquiryDialog({
    open,
    onOpenChange,
    onEnquiryCreated,
    departments: propDepartments = [],
    selectedDepartmentId = '',
    selectedSubdepartmentId = '',
    selectedClassId = '',
    users = [],
    officers = [],
    initialData = null
}: NewCompanyInquiryDialogProps) {
    const isEditMode = !!initialData;

    // DEBUG: Log initial data reception
    useEffect(() => {
        console.log(' NewCompanyInquiryDialog - initialData:', initialData);
        console.log(' NewCompanyInquiryDialog - isEditMode:', isEditMode);
        console.log(' NewCompanyInquiryDialog - open:', open);
    }, [initialData, isEditMode, open]);

    const [companies, setCompanies] = useState<Company[]>([])
    const [selectedCompany, setSelectedCompany] = useState<Company | null>(null)
    const [officials, setOfficials] = useState<Official[]>([])
    const [selectedOfficialIds, setSelectedOfficialIds] = useState<Set<number>>(new Set())
    const [primaryDirectorId, setPrimaryDirectorId] = useState<number | null>(null)
    const [companyLogo, setCompanyLogo] = useState<string | null>(null)
    const [loadingLogo, setLoadingLogo] = useState(false)

    const [loadingCompanies, setLoadingCompanies] = useState(false)
    const [loadingOfficials, setLoadingOfficials] = useState(false)
    const [loading, setLoading] = useState(false)
    const [loadingStaff, setLoadingStaff] = useState(false)

    const [isCompanyPopoverOpen, setIsCompanyPopoverOpen] = useState(false)

    const [departments, setDepartments] = useState<any[]>(propDepartments || [])
    const [localUsers, setLocalUsers] = useState<any[]>(users || [])
    const [localOfficers, setLocalOfficers] = useState<any[]>(() => (officers || []).map(normalizeAuthOfficer))
    const [taskType, setTaskType] = useState<'new' | 'renewal'>('new')
    const [availableOfficers, setAvailableOfficers] = useState([])
    const [availableManagers, setAvailableManagers] = useState([])
    const [availableAssistants, setAvailableAssistants] = useState([])

    // Job questions state
    const [jobQuestions, setJobQuestions] = useState<any[]>([])
    const [jobAnswers, setJobAnswers] = useState<Record<string, any>>({})
    const [loadingQuestions, setLoadingQuestions] = useState(false)

    const [formData, setFormData] = useState({
        job_description: '',
        department_id: '',
        subdepartment_id: '',
        class_id: '',
        subclass_id: '',
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
    const availableSubdepartments = useMemo(() => {
        const dept = departments.find(d => String(d.id) === String(formData.department_id));
        return dept?.tm_subdepartments || [];
    }, [departments, formData.department_id]);

    const availableClasses = useMemo(() => {
        const subdept = availableSubdepartments.find(s => String(s.id) === String(formData.subdepartment_id));
        return subdept?.classes?.filter(cls => !cls.parentId) || [];
    }, [availableSubdepartments, formData.subdepartment_id]);

    const availableSubclasses = useMemo(() => {
        const subdept = availableSubdepartments.find(s => String(s.id) === String(formData.subdepartment_id));
        if (!subdept?.classes) return [];
        const findClass = (classes: any[]): any[] => {
            for (const cls of classes) {
                if (String(cls.id) === String(formData.class_id)) return cls.subClasses || [];
                if (cls.subClasses?.length) {
                    const found = findClass(cls.subClasses);
                    if (found) return found;
                }
            }
            return [];
        };
        return findClass(subdept.classes);
    }, [availableSubdepartments, formData.subdepartment_id, formData.class_id]);
    // Memoized options arrays for SearchableSelect components
    const companyOptions = useMemo(() =>
        companies.map(c => ({ value: c.id.toString(), label: c.company_name })),
        [companies]
    );

    const departmentOptions = useMemo(() =>
        departments.map(d => ({ value: d.id.toString(), label: d.name })),
        [departments]
    );

    const subdepartmentOptions = useMemo(() =>
        availableSubdepartments.map(sd => ({ value: sd.id.toString(), label: sd.name })),
        [availableSubdepartments]
    );

    const classOptions = useMemo(() =>
        availableClasses.map(c => ({ value: c.id.toString(), label: c.name })),
        [availableClasses]
    );

    const subclassOptions = useMemo(() =>
        availableSubclasses.map(sc => ({ value: sc.id.toString(), label: sc.name })),
        [availableSubclasses]
    );

    const officerOptions = useMemo(() => [
        { value: 'none', label: 'No Officer' },
        ...localOfficers.map(o => ({ value: o.id.toString(), label: o.name }))
    ], [localOfficers]);

    const managerOptions = useMemo(() => {
        // Filter managers by job level access and role_type 'manager'
        const filteredManagers = localUsers.filter(user =>
            hasJobLevelAccess(user, formData.department_id, formData.subdepartment_id, formData.class_id) &&
            user.jobLevels && user.jobLevels.some((jobLevel: any) => jobLevel.role_type === 'manager')
        );
        return [
            { value: 'none', label: 'No Manager' },
            ...filteredManagers.map(m => ({ value: m.id.toString(), label: m.name }))
        ];
    }, [localUsers, formData.department_id, formData.subdepartment_id, formData.class_id]);

    const assistantOptions = useMemo(() => {
        // Filter assistants by job level access and role_type 'assistant'
        const filteredAssistants = localUsers.filter(user =>
            hasJobLevelAccess(user, formData.department_id, formData.subdepartment_id, formData.class_id) &&
            user.jobLevels && user.jobLevels.some((jobLevel: any) => jobLevel.role_type === 'assistant')
        );
        return [
            { value: 'none', label: 'No Assistant' },
            ...filteredAssistants.map(a => ({ value: a.id.toString(), label: a.name }))
        ];
    }, [localUsers, formData.department_id, formData.subdepartment_id, formData.class_id]);

    // Get inherited officer for the selected subdepartment
    const getInheritedOfficerForSubdepartment = useCallback(async (subdepartmentId: string) => {
        if (!subdepartmentId || !formData.department_id) return null;

        try {
            // Get the parent department (without officers_history since it doesn't exist)
            const { data: department, error: deptError } = await supabase
                .from('tm_departments')
                .select('id, name')
                .eq('id', formData.department_id)
                .single();

            if (deptError) throw deptError;

            // Get the subdepartment with its officer history
            const { data: subdepartment, error: subError } = await supabase
                .from('tm_subdepartments')
                .select('id, name, officer_history')
                .eq('id', subdepartmentId)
                .single();

            if (subError) throw subError;

            // Fetch real officers from scanner_users
            const realOfficers = await fetchAuthOfficers();

            // Create a mock department structure for inheritance logic
            const departmentForInheritance = {
                ...department,
                officers_history: [] // Departments don't have officers_history in the current schema
            };

            // Use the inheritance logic to get officer ID
            const inheritedOfficer = getInheritedOfficer(
                subdepartment.officer_history || [],
                departmentForInheritance
            );

            // Find the real officer from scanner_users
            if (inheritedOfficer && realOfficers.length > 0) {
                const realOfficer = realOfficers.find(officer =>
                    officer.id === inheritedOfficer.id.toString() ||
                    officer.id === inheritedOfficer.id
                );

                if (realOfficer) return normalizeAuthOfficer(realOfficer);
            }

            return null;
        } catch (error) {
            console.error('Error getting inherited officer:', error);
            return null;
        }
    }, [formData.department_id]);

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

    // Fetch company logo
    const fetchCompanyLogo = useCallback(async (companyId: number) => {
        setLoadingLogo(true);
        setCompanyLogo(null);

        try {
            const { data: logoDoc } = await supabase
                .from('acc_portal_kyc_uploads')
                .select('file_path')
                .eq('company_id', companyId)
                .eq('document_id', COMPANY_LOGO_ID)
                .maybeSingle();

            if (logoDoc?.file_path) {
                const imageUrl = getSupabaseImageUrl(logoDoc.file_path);
                if (imageUrl) {
                    setCompanyLogo(imageUrl);
                }
            }
        } catch (error) {
            console.error('Error fetching company logo:', error);
        } finally {
            setLoadingLogo(false);
        }
    }, [getSupabaseImageUrl]);

    // Populate form on Edit Mode
    useEffect(() => {
        console.log('🔍 Form population useEffect triggered:', { open, hasInitialData: !!initialData });

        if (open && initialData) {
            console.log('🔍 Populating form with initialData:', initialData);

            setFormData({
                job_description: initialData.job_description || '',
                department_id: initialData.department_id?.toString() || '',
                subdepartment_id: initialData.subdepartment_id?.toString() || '',
                class_id: initialData.class_id?.toString() || '',
                subclass_id: initialData.subclass_id?.toString() || '',
                officer_id: initialData.officer_id?.toString() || '',
                task_manager_id: initialData.task_manager_id?.toString() || '',
                task_assistant_id: initialData.task_assistant_id?.toString() || '',
                enquiry_date: initialData.date_initiated ? new Date(initialData.date_initiated).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
                job_level: initialData.job_level || {
                    level: 1,
                    department_id: null,
                    subdepartment_id: null,
                    class_id: null,
                    subclass_id: null
                }
            });
            setTaskType(initialData.renewal_status || 'new');

            // FIX: Use applicant_details for company info instead of company_id
            const companyInfo = initialData.applicant_details || initialData.company_details;
            if (companyInfo) {
                setSelectedCompany({
                    id: companyInfo.id,
                    company_name: companyInfo.name
                });
                console.log('🔍 Set selected company from applicant_details:', { id: companyInfo.id, name: companyInfo.name });
            } else {
                console.warn('🔍 No company info found in applicant_details or company_details');
            }

            // FIX: Look for directors in participants_details instead of directors_details
            const participants = initialData.participants_details || [];
            console.log('🔍 Processing participants_details:', participants);

            const directors = participants.filter((p: any) =>
                p.type === 'individual' &&
                (p.role.includes('Director') || p.role.includes('director'))
            );

            if (directors.length > 0) {
                console.log('🔍 Found directors in participants:', directors);
                const directorIds = directors.map((d: any) => d.id);
                setSelectedOfficialIds(new Set(directorIds));
                const primary = directors.find((d: any) => d.is_primary);
                if (primary) {
                    console.log('🔍 Set primary director:', primary);
                    setPrimaryDirectorId(primary.id);
                }
            } else {
                console.log('🔍 No directors found in participants_details');
            }

            // FIX: Process other participants and set form fields
            const officer = participants.find((p: any) =>
                p.type === 'individual' && p.role.includes('officer')
            );
            const taskManager = participants.find((p: any) =>
                p.type === 'individual' && p.role.includes('task_manager')
            );
            const taskAssistant = participants.find((p: any) =>
                p.type === 'individual' && p.role.includes('task_assistant')
            );

            if (officer) {
                console.log('🔍 Found officer:', officer);
                setFormData(prev => ({ ...prev, officer_id: officer.id.toString() }));
            }
            if (taskManager) {
                console.log('🔍 Found task manager:', taskManager);
                setFormData(prev => ({ ...prev, task_manager_id: taskManager.id.toString() }));
            }
            if (taskAssistant) {
                console.log('🔍 Found task assistant:', taskAssistant);
                setFormData(prev => ({ ...prev, task_assistant_id: taskAssistant.id.toString() }));
            }

            // FIX: Populate job specific answers from initial data
            if (initialData.job_specific_answers) {
                console.log('🔍 Populating job specific answers:', initialData.job_specific_answers);
                setJobAnswers(initialData.job_specific_answers);
            }
        } else if (open && !initialData) {
            console.log('🔍 Resetting form (new mode)');
            resetForm();
        }
    }, [open, initialData]);

    // Auto-set inherited officer when subdepartment changes
    useEffect(() => {
        const updateInheritedOfficer = async () => {
            if (formData.subdepartment_id && formData.department_id) {
                const inheritedOfficer = await getInheritedOfficerForSubdepartment(formData.subdepartment_id);
                if (inheritedOfficer && !formData.officer_id) {
                    // Only auto-set if no officer is currently selected
                    setFormData(prev => ({
                        ...prev,
                        officer_id: inheritedOfficer.id.toString()
                    }));
                }
            }
        };

        updateInheritedOfficer();
    }, [formData.subdepartment_id, formData.department_id, getInheritedOfficerForSubdepartment, formData.officer_id]);

    const loadCompanies = useCallback(async () => {
        setLoadingCompanies(true);
        try {
            const { data, error } = await supabase
                .from('acc_portal_company_duplicate')
                .select('id, company_name')
                .order('company_name');
            if (!error) setCompanies(data || []);
        } finally {
            setLoadingCompanies(false);
        }
    }, []);

    // Fetch official photo
    const fetchOfficialPhoto = useCallback(async (individualId: number): Promise<string | null> => {
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
                return getSupabaseImageUrl(photoDoc.file_path);
            }
        } catch (error) {
            console.error('Error fetching official photo:', error);
        }
        return null;
    }, [getSupabaseImageUrl]);

    const fetchOfficials = useCallback(async (companyId: number) => {
        setLoadingOfficials(true);
        try {
            console.log('🔍 fetchOfficials called with companyId:', companyId);

            // Skip fetching if companyId is null or undefined
            if (!companyId) {
                console.warn('🔍 fetchOfficials: No companyId provided, skipping fetch');
                setOfficials([]);
                return;
            }

            const { data, error } = await supabase
                .from('registry_individuals')
                .select('id, full_name, employment_data')
                .order('full_name');

            if (error) throw error;

            const associatedMap = new Map<number, Official>();

            (data || []).forEach(individual => {
                const associations = individual.employment_data?.associations || [];
                const relevantAssociations = associations.filter(assoc =>
                    assoc.company_id?.toString() === companyId.toString() &&
                    (assoc.individual_type === 'Director' || assoc.individual_type === 'Shareholder')
                );

                if (relevantAssociations.length > 0) {
                    const roles = Array.from(new Set(relevantAssociations.map(a => a.individual_type)));
                    const isAnyActive = relevantAssociations.some(a => a.is_current === true);

                    associatedMap.set(individual.id, {
                        id: individual.id,
                        full_name: individual.full_name,
                        is_current: isAnyActive,
                        roles: roles,
                        primary_role: roles.includes('Director') ? 'Director' : 'Shareholder'
                    });
                }
            });

            const uniqueOfficials = Array.from(associatedMap.values());
            console.log('🔍 fetchOfficials found officials:', uniqueOfficials);

            // Fetch photos for each official
            const officialsWithPhotos = await Promise.all(
                uniqueOfficials.map(async (official) => {
                    const photoUrl = await fetchOfficialPhoto(official.id);
                    return {
                        ...official,
                        photoUrl
                    };
                })
            );

            setOfficials(officialsWithPhotos);

            if (!isEditMode) {
                const activeOfficialIds = uniqueOfficials
                    .filter(d => d.is_current)
                    .map(d => d.id);
                setSelectedOfficialIds(new Set(activeOfficialIds));
            }

        } catch (error) {
            console.error('Error fetching officials:', error);
        } finally {
            setLoadingOfficials(false);
        }
    }, [isEditMode, fetchOfficialPhoto]);

    // Fetch job questions
    const fetchJobQuestions = useCallback(async (levelObj: any) => {
        setLoadingQuestions(true)
        try {
            const { data } = await supabase
                .from('tm_class_requirements')
                .select('job_specific_questions')
                .contains('job_level', levelObj)
                .maybeSingle()

            if (data?.job_specific_questions) {
                setJobQuestions(data.job_specific_questions)
                // Set defaults
                const initial: any = {}
                data.job_specific_questions.forEach((q: any) => {
                    if (q.default_value) {
                        // For multiselect, ensure default value is an array
                        if (q.type === 'multiselect') {
                            initial[q.id] = Array.isArray(q.default_value) ? q.default_value : [q.default_value]
                        } else {
                            initial[q.id] = q.default_value
                        }
                    }
                })
                setJobAnswers(initial)
            } else {
                setJobQuestions([])
            }
        } finally {
            setLoadingQuestions(false)
        }
    }, [])

    // Fetch job questions when classification changes
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

    // Check question visibility
    const checkVisibility = useCallback((q: any) => {
        if (!q.depends_on || !q.depends_on.id) return true;

        const parentVal = jobAnswers[q.depends_on.id];
        const targetVal = q.depends_on.value;

        switch (q.depends_on.operator) {
            case 'equals':
                return String(parentVal) === String(targetVal);
            case 'not_equals':
                // Only show if parent value exists and is not equal to target
                if (parentVal === undefined || parentVal === null || parentVal === '') return false;
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

    // Group questions by category
    const groupedQuestions = useMemo(() => {
        const visible = jobQuestions.filter(q => checkVisibility(q));
        return visible.reduce((acc, q) => {
            const cat = q.category || "General Requirements";
            if (!acc[cat]) acc[cat] = [];
            acc[cat].push(q);
            return acc;
        }, {} as Record<string, any[]>);
    }, [jobQuestions, checkVisibility]);

    useEffect(() => {
        if (open && companies.length === 0) loadCompanies();
        if (open && !isEditMode && selectedDepartmentId) {
            setFormData(prev => ({
                ...prev,
                department_id: String(selectedDepartmentId),
                subdepartment_id: String(selectedSubdepartmentId || ''),
                class_id: String(selectedClassId || '')
            }));
        }
    }, [open, selectedDepartmentId, loadCompanies, isEditMode]);

    useEffect(() => {
        if (selectedCompany) {
            fetchOfficials(selectedCompany.id);
            fetchCompanyLogo(selectedCompany.id);
        }
    }, [selectedCompany, fetchOfficials, fetchCompanyLogo]);

    const loadStaffData = useCallback(async () => {
        setLoadingStaff(true);
        try {
            const [userAssignmentData, officersResult] = await Promise.all([
                fetchUserAssignmentData({ payrollAccess: true }),
                fetchAuthOfficers()
            ]);
            setLocalUsers(userAssignmentData.allUsers || []);
            setLocalOfficers(officersResult);
        } finally {
            setLoadingStaff(false);
        }
    }, []);

    useEffect(() => {
        if (users.length > 0) setLocalUsers(users);
        if (officers.length > 0) setLocalOfficers(officers.map(normalizeAuthOfficer));

        if (open && (localUsers.length === 0 || localOfficers.length === 0)) {
            loadStaffData();
        }
    }, [open, users, officers, localUsers.length, localOfficers.length, loadStaffData]);


    const handleOfficialSelection = (officialId: number) => {
        setSelectedOfficialIds(prev => {
            const newSet = new Set(prev);
            const official = officials.find(o => o.id === officialId);
            if (newSet.has(officialId)) {
                newSet.delete(officialId);
                if (primaryDirectorId === officialId) setPrimaryDirectorId(null);
            } else {
                newSet.add(officialId);
                if (official?.roles.includes('Director') && !primaryDirectorId) setPrimaryDirectorId(officialId);
            }
            return newSet;
        });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedCompany || selectedOfficialIds.size === 0) {
            toast({ title: "Validation Error", description: "Missing company or officials.", variant: "destructive" });
            return;
        }

        setLoading(true);
        try {
            // Build participants array
            const participants_details = [];

            // Add company officials as participants
            Array.from(selectedOfficialIds).forEach(officialId => {
                const official = officials.find(o => o.id === officialId);
                if (official) {
                    participants_details.push({
                        id: official.id,
                        name: official.full_name,
                        role: official.roles.map(r => r.toLowerCase()),
                        type: "individual",
                        is_primary: officialId === primaryDirectorId
                    });
                }
            });

            // Add assigned staff as participants
            if (formData.officer_id && formData.officer_id !== 'none') {
                const officer = localOfficers.find(o => o.id.toString() === formData.officer_id);
                if (officer) {
                    participants_details.push({
                        id: officer.id,
                        name: officer.name,
                        role: ["officer"],
                        type: "individual",
                        is_primary: false
                    });
                }
            }

            if (formData.task_manager_id && formData.task_manager_id !== 'none') {
                const manager = localUsers.find(u => u.id.toString() === formData.task_manager_id);
                if (manager) {
                    participants_details.push({
                        id: manager.id,
                        name: manager.name,
                        role: ["task_manager"],
                        type: "individual",
                        is_primary: false
                    });
                }
            }

            if (formData.task_assistant_id && formData.task_assistant_id !== 'none') {
                const assistant = localUsers.find(u => u.id.toString() === formData.task_assistant_id);
                if (assistant) {
                    participants_details.push({
                        id: assistant.id,
                        name: assistant.name,
                        role: ["task_assistant"],
                        type: "individual",
                        is_primary: false
                    });
                }
            }

            const taskPayload = {
                status: 'enquiry',
                date_initiated: new Date(formData.enquiry_date).toISOString(),
                created_by: null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                account_used: null,
                batch: null,
                applied_by: "11", // This might need to be dynamic
                stages: {
                    "1e6ebd85-db1e-4eb9-abb6-5fc145ac8caa": {
                        date: format(new Date(formData.enquiry_date), 'dd/MM/yyyy'),
                        status: "completed",
                        completedAt: new Date(formData.enquiry_date).toISOString()
                    }
                },
                job_description: formData.job_description,
                source_document_id: null,
                job_level: {
                    level: formData.subclass_id ? 4 : formData.class_id ? 3 : formData.subdepartment_id ? 2 : 1,
                    department_id: parseInt(formData.department_id) || null,
                    subdepartment_id: parseInt(formData.subdepartment_id) || null,
                    class_id: parseInt(formData.class_id) || null,
                    subclass_id: parseInt(formData.subclass_id) || null
                },
                applicant_details: {
                    id: selectedCompany.id,
                    name: selectedCompany.company_name,
                    type: "company"
                },
                participants_details: participants_details,
                job_specific_answers: jobAnswers // FIX: Add job specific answers to payload
            };

            let result;
            if (isEditMode) {
                result = await supabase.from('tm_tasks').update(taskPayload).eq('id', initialData.id).select();
            } else {
                result = await supabase.from('tm_tasks').insert([taskPayload]).select();
            }

            if (result.error) throw result.error;

            // Ensure we have valid data before proceeding
            if (!result.data || result.data.length === 0) {
                throw new Error('No data returned from database operation');
            }

            // Show success toast with more specific information
            toast({
                title: 'Success',
                description: `Enquiry ${isEditMode ? 'updated' : 'created'} successfully`
            });

            // Call the parent callback with the newly created/updated data
            onEnquiryCreated(result.data);

            // Close the dialog
            onOpenChange(false);

            // Reset form after successful submission
            if (!isEditMode) {
                resetForm();
            }
        } catch (error) {
            toast({ title: 'Error', description: error.message, variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    };

    const resetForm = () => {
        setSelectedCompany(null);
        setOfficials([]);
        setSelectedOfficialIds(new Set());
        setPrimaryDirectorId(null);
        setTaskType('new');
        setCompanyLogo(null);
        setJobQuestions([]);
        setJobAnswers({});
        setFormData({
            job_description: '',
            department_id: selectedDepartmentId || '',
            subdepartment_id: selectedSubdepartmentId || '',
            class_id: selectedClassId || '',
            subclass_id: '',
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
    };

    const dialogTitle = isEditMode
        ? `Edit Company Enquiry: ${initialData?.applicant_name || 'Loading...'}`
        : "New Company Enquiry";

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
                <DialogHeader className="p-6 bg-indigo-600 text-white shrink-0 z-10 shadow-md relative">
                    <button
                        onClick={() => onOpenChange(false)}
                        className="absolute right-6 top-6 rounded-sm opacity-70 ring-offset-white transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 disabled:pointer-events-none"
                    >
                        <X className="h-5 w-5" />
                        <span className="sr-only">Close</span>
                    </button>
                    <div className="flex items-center justify-between pr-8">
                        <div className="flex items-center gap-4">
                            <div className="bg-white/20 p-2.5 rounded-xl"><Building2 className="h-6 w-6" /></div>
                            <div>
                                <DialogTitle className="text-2xl font-bold tracking-tight">
                                    {dialogTitle}
                                </DialogTitle>
                                <DialogDescription className="text-indigo-100 font-medium">
                                    {isEditMode ? 'Updating existing company records' : 'Register new company enquiry with officials'}
                                </DialogDescription>
                            </div>
                        </div>
                    </div>
                </DialogHeader>

                {/* SCROLLABLE CONTENT AREA */}
                <ScrollArea className="flex-1 w-full overflow-y-auto bg-slate-50/50">
                    <form id="company-enquiry-form" onSubmit={handleSubmit} className="p-6 space-y-6 grid grid-cols-2 gap-4">
                        <div className="col-span-1">
                            {/* COMPANY IDENTIFICATION SECTION */}
                            <Card className="border-indigo-100 shadow-sm overflow-hidden bg-white mb-4">
                                <CardHeader className="bg-indigo-50/50 py-3 px-6 border-b border-indigo-100">
                                    <CardTitle className="text-sm font-black text-indigo-800 uppercase tracking-wider flex items-center gap-2">
                                        <Building2 className="h-4 w-4" />
                                        Company Identification
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-6 space-y-0">
                                    <TableRow label="Company" required>
                                        <div className="flex items-center gap-4">
                                            {/* Logo Preview */}
                                            <div className="shrink-0">
                                                {loadingLogo ? (
                                                    <div className="w-16 h-16 rounded-lg bg-slate-100 flex items-center justify-center">
                                                        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                                                    </div>
                                                ) : companyLogo ? (
                                                    <img
                                                        src={companyLogo}
                                                        alt="Company Logo"
                                                        className="w-16 h-16 rounded-lg object-contain border-2 border-indigo-100 bg-white p-1"
                                                    />
                                                ) : selectedCompany ? (
                                                    <div className="w-16 h-16 rounded-lg bg-gradient-to-br from-indigo-100 to-indigo-200 flex items-center justify-center">
                                                        <Building2 className="h-8 w-8 text-indigo-600" />
                                                    </div>
                                                ) : (
                                                    <div className="w-16 h-16 rounded-lg bg-slate-100 flex items-center justify-center">
                                                        <Building2 className="h-8 w-8 text-slate-400" />
                                                    </div>
                                                )}
                                            </div>

                                            {/* Search Popover */}
                                            <div className="flex-1">
                                                <Popover open={isCompanyPopoverOpen} onOpenChange={setIsCompanyPopoverOpen}>
                                                    <PopoverTrigger asChild>
                                                        <Button variant="outline" className="w-full justify-between h-11 border-slate-200 bg-white">
                                                            {selectedCompany ? <span className="font-bold text-slate-800">{selectedCompany.company_name}</span> : <span className="text-slate-400">Search company database...</span>}
                                                            <Search className="h-4 w-4 opacity-30" />
                                                        </Button>
                                                    </PopoverTrigger>
                                                    <PopoverContent className="w-[400px] p-0 max-h-[400px]" align="start">
                                                        <Command className="h-full rounded-lg border shadow-md">
                                                            <CommandInput placeholder="Type company name..." />
                                                            <CommandList
                                                                className="max-h-[350px] overflow-y-auto overscroll-contain"
                                                                onWheel={(e) => e.stopPropagation()}
                                                            >
                                                                <CommandEmpty>No companies found.</CommandEmpty>
                                                                <CommandGroup>
                                                                    {loadingCompanies ? (
                                                                        <div className="flex justify-center p-4">
                                                                            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                                                                        </div>
                                                                    ) : companies.map((c) => (
                                                                        <CommandItem key={c.id} onSelect={() => { setSelectedCompany(c); setIsCompanyPopoverOpen(false); }}>
                                                                            <Check className={cn("mr-2 h-4 w-4 text-indigo-600", selectedCompany?.id === c.id ? "opacity-100" : "opacity-0")} />
                                                                            {c.company_name}
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

                                    <TableRow label="Task Context">
                                        <Select value={taskType} onValueChange={(v: any) => setTaskType(v)}>
                                            <SelectTrigger className="h-11 border-slate-200 bg-white max-w-xs">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="new">New Application</SelectItem>
                                                <SelectItem value="renewal">Renewal/Compliance</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </TableRow>
                                </CardContent>
                            </Card>

                            {/* COMPANY OFFICIALS SECTION */}
                            {selectedCompany && (
                                <Card className="border-indigo-100 shadow-sm overflow-hidden bg-white mb-4">
                                    <CardHeader className="bg-indigo-50/50 py-3 px-6 border-b border-indigo-100">
                                        <CardTitle className="text-sm font-black text-indigo-800 uppercase tracking-wider flex items-center gap-2">
                                            <Users className="h-4 w-4" />
                                            Company Officials
                                        </CardTitle>
                                        <CardDescription className="text-xs text-indigo-600 mt-1">
                                            Select directors or shareholders to include in this enquiry
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent className="p-6">
                                        {loadingOfficials ? (
                                            <div className="flex flex-col items-center py-8 text-muted-foreground gap-3">
                                                <Loader2 className="h-6 w-6 animate-spin text-indigo-400" />
                                                <span className="text-sm text-slate-500">Loading company officials...</span>
                                            </div>
                                        ) : officials.length > 0 ? (
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[400px] overflow-y-auto pr-2">
                                                {officials.map((official) => (
                                                    <div
                                                        key={official.id}
                                                        className={cn(
                                                            "p-4 rounded-lg border transition-all cursor-pointer",
                                                            selectedOfficialIds.has(official.id)
                                                                ? "bg-indigo-50/50 border-indigo-200 shadow-sm"
                                                                : "bg-white border-slate-200 hover:border-indigo-100"
                                                        )}
                                                        onClick={() => handleOfficialSelection(official.id)}
                                                    >
                                                        <div className="flex items-start gap-4">
                                                            {/* Photo Preview */}
                                                            <div className="shrink-0">
                                                                {official.photoUrl ? (
                                                                    <img
                                                                        src={official.photoUrl}
                                                                        alt={official.full_name}
                                                                        className="w-12 h-12 rounded-lg object-cover border-2 border-indigo-100"
                                                                    />
                                                                ) : (
                                                                    <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-indigo-100 to-indigo-200 flex items-center justify-center">
                                                                        <User className="h-6 w-6 text-indigo-600" />
                                                                    </div>
                                                                )}
                                                            </div>

                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-center gap-2 mb-2">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={selectedOfficialIds.has(official.id)}
                                                                        onChange={() => handleOfficialSelection(official.id)}
                                                                        onClick={(e) => e.stopPropagation()}
                                                                        className="h-4 w-4 rounded border-slate-300 text-indigo-600 cursor-pointer"
                                                                    />
                                                                    <span className="text-sm font-bold truncate text-slate-800">{official.full_name}</span>
                                                                    {official.is_current ? (
                                                                        <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] px-2 py-0.5 h-5">
                                                                            Active
                                                                        </Badge>
                                                                    ) : (
                                                                        <Badge className="bg-slate-50 text-slate-500 border-slate-200 text-[10px] px-2 py-0.5 h-5">
                                                                            Inactive
                                                                        </Badge>
                                                                    )}
                                                                </div>

                                                                <div className="flex flex-wrap gap-1.5 mb-2">
                                                                    {official.roles.map(role => (
                                                                        <Badge key={role} variant="outline" className={cn(
                                                                            "text-[10px] px-2 py-0.5 h-5 uppercase font-bold",
                                                                            role === 'Director'
                                                                                ? "text-indigo-600 border-indigo-200 bg-indigo-50"
                                                                                : "text-amber-600 border-amber-200 bg-amber-50"
                                                                        )}>
                                                                            {role}
                                                                        </Badge>
                                                                    ))}
                                                                </div>

                                                                {official.roles.includes('Director') && selectedOfficialIds.has(official.id) && (
                                                                    <div className="mt-2 pt-2 border-t border-indigo-100 flex items-center gap-2">
                                                                        <input
                                                                            type="radio"
                                                                            id={`primary-${official.id}`}
                                                                            name="primary-director"
                                                                            checked={primaryDirectorId === official.id}
                                                                            onChange={() => setPrimaryDirectorId(official.id)}
                                                                            onClick={(e) => e.stopPropagation()}
                                                                            className="h-3.5 w-3.5 text-indigo-600 cursor-pointer"
                                                                        />
                                                                        <label
                                                                            htmlFor={`primary-${official.id}`}
                                                                            className="text-[11px] text-indigo-600 cursor-pointer font-semibold"
                                                                            onClick={(e) => e.stopPropagation()}
                                                                        >
                                                                            Primary Director
                                                                        </label>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="text-center py-12 text-slate-400 bg-slate-50 rounded-lg border-2 border-dashed border-slate-200">
                                                <Info className="h-10 w-10 mx-auto mb-3 opacity-20" />
                                                <p className="text-sm font-medium">No officials linked to this company</p>
                                                <p className="text-xs mt-1">Please ensure directors/shareholders are registered</p>
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            )}

                            {/* PROCESS CLASSIFICATION SECTION */}
                            <Card className="border-indigo-100 shadow-sm overflow-hidden bg-white mb-4">
                                <CardHeader className="bg-indigo-50/50 py-3 px-6 border-b border-indigo-100">
                                    <CardTitle className="text-sm font-black text-indigo-800 uppercase tracking-wider flex items-center gap-2">
                                        <Briefcase className="h-4 w-4" />
                                        Process Classification
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-6 space-y-0">
                                    <TableRow label="Department" required>
                                        <SearchableSelect
                                            value={formData.department_id}
                                            onValueChange={(v) => setFormData(prev => ({ ...prev, department_id: v, subdepartment_id: '', class_id: '', subclass_id: '' }))}
                                            options={departmentOptions}
                                            placeholder="Select Department"
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
                                            onValueChange={(v) => setFormData(prev => ({ ...prev, subdepartment_id: v, class_id: '', subclass_id: '' }))}
                                            options={subdepartmentOptions}
                                            placeholder="Select Sub-Department"
                                            disabled={!formData.department_id || subdepartmentOptions.length === 0}
                                            emptyMessage="No sub-departments found."
                                            searchPlaceholder="Search sub-department..."
                                            buttonClassName="h-11 bg-white border-slate-200"
                                            popoverClassName="w-[--radix-popover-trigger-width]"
                                            allowClear={true}
                                        />
                                    </TableRow>

                                    <TableRow label="Class">
                                        <SearchableSelect
                                            value={formData.class_id}
                                            onValueChange={(v) => setFormData(prev => ({ ...prev, class_id: v, subclass_id: '' }))}
                                            options={classOptions}
                                            placeholder="Select Class"
                                            disabled={!formData.subdepartment_id || classOptions.length === 0}
                                            emptyMessage="No classes found."
                                            searchPlaceholder="Search class..."
                                            buttonClassName="h-11 bg-white border-slate-200"
                                            popoverClassName="w-[--radix-popover-trigger-width]"
                                            allowClear={true}
                                        />
                                    </TableRow>

                                    <TableRow label="Subclass">
                                        <SearchableSelect
                                            value={formData.subclass_id}
                                            onValueChange={(v) => setFormData(p => ({ ...p, subclass_id: v }))}
                                            options={subclassOptions}
                                            placeholder="Select Subclass"
                                            disabled={!formData.class_id || subclassOptions.length === 0}
                                            emptyMessage="No subclasses found."
                                            searchPlaceholder="Search subclass..."
                                            buttonClassName="h-11 bg-white border-slate-200"
                                            popoverClassName="w-[--radix-popover-trigger-width]"
                                            allowClear={true}
                                        />
                                    </TableRow>
                                </CardContent>
                            </Card>

                            {/* INTERNAL PROCESSING SECTION */}
                            <Card className="border-indigo-100 shadow-sm overflow-hidden bg-white mb-4">
                                <CardHeader className="bg-indigo-50/50 py-3 px-6 border-b border-indigo-100">
                                    <CardTitle className="text-sm font-black text-indigo-800 uppercase tracking-wider flex items-center gap-2">
                                        <Shield className="h-4 w-4" />
                                        Internal Processing
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-6 space-y-0">
                                    <TableRow label="Assigned Officer">
                                        <SearchableSelect
                                            value={formData.officer_id}
                                            onValueChange={(v) => setFormData(p => ({ ...p, officer_id: v }))}
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
                                            onValueChange={(v) => setFormData(p => ({ ...p, task_manager_id: v }))}
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

                                    <TableRow label="Task Assistant">
                                        <SearchableSelect
                                            value={formData.task_assistant_id}
                                            onValueChange={(v) => setFormData(p => ({ ...p, task_assistant_id: v }))}
                                            options={assistantOptions}
                                            placeholder="Select Assistant"
                                            disabled={assistantOptions.length === 0}
                                            emptyMessage="No assistants found."
                                            searchPlaceholder="Search assistant..."
                                            buttonClassName="h-11 bg-white border-slate-200"
                                            popoverClassName="w-[--radix-popover-trigger-width]"
                                            allowClear={true}
                                        />
                                    </TableRow>

                                    <TableRow label="Enquiry Date" required>
                                        <div className="relative max-w-sm">
                                            <Input
                                                type="date"
                                                value={formData.enquiry_date}
                                                onChange={(e) => setFormData(p => ({ ...p, enquiry_date: e.target.value }))}
                                                className="pl-10 h-11 border-slate-200 bg-white"
                                                required
                                            />
                                            <Calendar className="absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
                                        </div>
                                    </TableRow>
                                </CardContent>
                            </Card>
                        </div>

                        <div className="col-span-1">
                            {/* JOB SPECIFIC QUESTIONS SECTION */}
                            <Card className="border-indigo-100 shadow-sm overflow-hidden bg-white mb-4">
                                <CardHeader className="bg-indigo-50/50 px-6 border-b border-indigo-100">
                                    <CardTitle className="text-sm font-black text-indigo-800 uppercase tracking-wider flex items-center gap-2">
                                        <HelpCircle className="h-4 w-4" />
                                        Job Specific Questions
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="px-6 py-2">
                                    {Object.entries(groupedQuestions).length > 0 ? (
                                        <div className="space-y-2">
                                            {Object.entries(groupedQuestions).map(([category, questions]) => (
                                                <div key={category} className="space-y-2">
                                                    <div className="flex items-center gap-2 pb-2 border-b border-slate-200">
                                                        <Folder className="h-4 w-4 text-indigo-600" />
                                                        <h3 className="text-sm font-black text-indigo-800 uppercase tracking-wider">{category}</h3>
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
                                                                        <div className="flex gap-2">
                                                                            <Popover>
                                                                                <PopoverTrigger asChild>
                                                                                    <Button variant="outline" className="flex-1 justify-between h-11 bg-white border-slate-200">
                                                                                        <span className="truncate">
                                                                                            {q.type === 'multiselect'
                                                                                                ? (Array.isArray(jobAnswers[q.id]) && jobAnswers[q.id].length > 0 ? `${jobAnswers[q.id].length} Selected` : "Choose multiple...")
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
                                                                                                            "mr-2 h-4 w-4 text-indigo-600",
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
                                                                            {q.type === 'multiselect' && Array.isArray(jobAnswers[q.id]) && jobAnswers[q.id].length > 0 && (
                                                                                <Button
                                                                                    variant="outline"
                                                                                    size="sm"
                                                                                    onClick={() => setJobAnswers(prev => ({ ...prev, [q.id]: [] }))}
                                                                                    className="h-11 px-3 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                                                                                >
                                                                                    <X className="h-3.5 w-3.5" />
                                                                                </Button>
                                                                            )}
                                                                        </div>

                                                                        {/* Multiselect Badges */}
                                                                        {q.type === 'multiselect' && Array.isArray(jobAnswers[q.id]) && jobAnswers[q.id].length > 0 && (
                                                                            <div className="flex flex-wrap gap-1.5">
                                                                                {jobAnswers[q.id].map(val => (
                                                                                    <Badge key={val} variant="secondary" className="text-xs py-1 px-2 bg-indigo-50 text-indigo-600 border-indigo-100 flex items-center gap-1">
                                                                                        {val}
                                                                                        <X
                                                                                            className="h-3 w-3 cursor-pointer hover:text-indigo-800"
                                                                                            onClick={() => setJobAnswers(prev => ({ ...prev, [q.id]: Array.isArray(prev[q.id]) ? prev[q.id].filter(x => x !== val) : [] }))}
                                                                                        />
                                                                                    </Badge>
                                                                                ))}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                )}

                                                                {q.type === 'field_group' && q.sub_questions && (
                                                                    <div className="space-y-3 bg-slate-50 p-4 rounded-lg border border-slate-200">
                                                                        {q.sub_questions.map((subQ: any) => (
                                                                            <div key={subQ.id} className="space-y-1.5">
                                                                                <Label className="text-xs font-semibold text-slate-700">
                                                                                    {subQ.label}
                                                                                    {subQ.required && <span className="text-red-500 ml-1">*</span>}
                                                                                </Label>
                                                                                {subQ.type === 'text' && (
                                                                                    <Input
                                                                                        value={jobAnswers[subQ.id] || ''}
                                                                                        onChange={e => setJobAnswers(prev => ({ ...prev, [subQ.id]: e.target.value }))}
                                                                                        className="h-10 bg-white border-slate-200"
                                                                                        required={subQ.required}
                                                                                    />
                                                                                )}
                                                                                {subQ.type === 'boolean' && (
                                                                                    <RadioGroup
                                                                                        value={jobAnswers[subQ.id] === undefined ? "" : String(jobAnswers[subQ.id])}
                                                                                        onValueChange={v => setJobAnswers(prev => ({ ...prev, [subQ.id]: v === 'true' }))}
                                                                                        className="flex gap-3"
                                                                                    >
                                                                                        <div className="flex items-center space-x-2 bg-white px-3 py-1.5 rounded-md border border-slate-200">
                                                                                            <RadioGroupItem value="true" id={`subq-yes-${subQ.id}`} />
                                                                                            <Label htmlFor={`subq-yes-${subQ.id}`} className="text-xs cursor-pointer">Yes</Label>
                                                                                        </div>
                                                                                        <div className="flex items-center space-x-2 bg-white px-3 py-1.5 rounded-md border border-slate-200">
                                                                                            <RadioGroupItem value="false" id={`subq-no-${subQ.id}`} />
                                                                                            <Label htmlFor={`subq-no-${subQ.id}`} className="text-xs cursor-pointer">No</Label>
                                                                                        </div>
                                                                                    </RadioGroup>
                                                                                )}
                                                                                {(subQ.type === 'select' || subQ.type === 'multiselect') && (
                                                                                    <div className="space-y-2">
                                                                                        <div className="flex gap-2">
                                                                                            <Popover>
                                                                                                <PopoverTrigger asChild>
                                                                                                    <Button variant="outline" className="flex-1 justify-between h-10 bg-white border-slate-200">
                                                                                                        <span className="truncate text-xs">
                                                                                                            {subQ.type === 'multiselect'
                                                                                                                ? (Array.isArray(jobAnswers[subQ.id]) && jobAnswers[subQ.id].length > 0 ? `${jobAnswers[subQ.id].length} Selected` : "Choose multiple...")
                                                                                                                : (jobAnswers[subQ.id] || "Select option...")}
                                                                                                        </span>
                                                                                                        <ChevronsUpDown className="h-3 w-3 opacity-30" />
                                                                                                    </Button>
                                                                                                </PopoverTrigger>
                                                                                                <PopoverContent className="w-[300px] p-0">
                                                                                                    <Command>
                                                                                                        <CommandInput placeholder="Filter..." />
                                                                                                        <CommandList className="max-h-[200px] overflow-y-auto">
                                                                                                            <CommandGroup>
                                                                                                                {subQ.options?.map(opt => (
                                                                                                                    <CommandItem key={opt} onSelect={() => {
                                                                                                                        if (subQ.type === 'multiselect') {
                                                                                                                            const current = jobAnswers[subQ.id] || [];
                                                                                                                            const next = current.includes(opt) ? current.filter(x => x !== opt) : [...current, opt];
                                                                                                                            setJobAnswers(prev => ({ ...prev, [subQ.id]: next }));
                                                                                                                        } else {
                                                                                                                            setJobAnswers(prev => ({ ...prev, [subQ.id]: opt }));
                                                                                                                        }
                                                                                                                    }}>
                                                                                                                        <Check className={cn(
                                                                                                                            "mr-2 h-3 w-3 text-indigo-600",
                                                                                                                            subQ.type === 'multiselect'
                                                                                                                                ? jobAnswers[subQ.id]?.includes(opt) ? "opacity-100" : "opacity-0"
                                                                                                                                : jobAnswers[subQ.id] === opt ? "opacity-100" : "opacity-0"
                                                                                                                        )} />
                                                                                                                        {opt}
                                                                                                                    </CommandItem>
                                                                                                                ))}
                                                                                                            </CommandGroup>
                                                                                                        </CommandList>
                                                                                                    </Command>
                                                                                                </PopoverContent>
                                                                                            </Popover>
                                                                                            {subQ.type === 'multiselect' && Array.isArray(jobAnswers[subQ.id]) && jobAnswers[subQ.id].length > 0 && (
                                                                                                <Button
                                                                                                    variant="outline"
                                                                                                    size="sm"
                                                                                                    onClick={() => setJobAnswers(prev => ({ ...prev, [subQ.id]: [] }))}
                                                                                                    className="h-10 px-2 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                                                                                                >
                                                                                                    <X className="h-3 w-3" />
                                                                                                </Button>
                                                                                            )}
                                                                                        </div>
                                                                                        {subQ.type === 'multiselect' && Array.isArray(jobAnswers[subQ.id]) && jobAnswers[subQ.id].length > 0 && (
                                                                                            <div className="flex flex-wrap gap-1">
                                                                                                {jobAnswers[subQ.id].map(val => (
                                                                                                    <Badge key={val} variant="secondary" className="text-xs py-0.5 px-1.5 bg-indigo-50 text-indigo-600 border-indigo-100 flex items-center gap-1">
                                                                                                        {val}
                                                                                                        <X
                                                                                                            className="h-2.5 w-2.5 cursor-pointer hover:text-indigo-800"
                                                                                                            onClick={() => setJobAnswers(prev => ({ ...prev, [subQ.id]: Array.isArray(prev[subQ.id]) ? prev[subQ.id].filter(x => x !== val) : [] }))}
                                                                                                        />
                                                                                                    </Badge>
                                                                                                ))}
                                                                                            </div>
                                                                                        )}
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        ))}
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
                            <Card className="border-indigo-100 shadow-sm overflow-hidden bg-white mb-4">
                                <CardHeader className="bg-indigo-50/50 py-3 px-6 border-b border-indigo-100">
                                    <CardTitle className="text-sm font-black text-indigo-800 uppercase tracking-wider flex items-center gap-2">
                                        <FileText className="h-4 w-4" />
                                        Job Description
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-6">
                                    <Textarea
                                        value={formData.job_description}
                                        onChange={(e) => setFormData(p => ({ ...p, job_description: e.target.value }))}
                                        placeholder="Specify the services requested or the scope of work..."
                                        className="min-h-[120px] bg-white border-slate-200 p-4"
                                        required
                                    />
                                </CardContent>
                            </Card>
                        </div>
                    </form>
                </ScrollArea>

                {/* STATIC FOOTER */}
                <DialogFooter className="p-6 bg-white border-t border-indigo-100 shrink-0 z-10 shadow-[0_-4px_10px_rgba(0,0,0,0.03)]">
                    <div className="flex items-center justify-between w-full">
                        <div className="flex flex-col">
                            <span className="text-xs text-slate-400 font-semibold uppercase tracking-wide">Enquiry Ready</span>
                            <span className="text-sm text-indigo-600 font-bold truncate max-w-[400px]">
                                {selectedCompany?.company_name || "Awaiting Selection"}
                            </span>
                        </div>
                        <div className="flex gap-3">
                            <Button
                                type="button"
                                variant="ghost"
                                onClick={() => onOpenChange(false)}
                                disabled={loading}
                                className="px-6 font-semibold uppercase text-xs tracking-wide text-slate-500 hover:text-slate-700"
                            >
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                form="company-enquiry-form"
                                disabled={loading || !selectedCompany || selectedOfficialIds.size === 0}
                                className="px-10 bg-indigo-600 hover:bg-indigo-700 h-11 text-white font-bold uppercase text-xs tracking-wide transition-all"
                            >
                                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                                {isEditMode ? 'Update Enquiry' : 'Create Company Enquiry'}
                            </Button>
                        </div>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
