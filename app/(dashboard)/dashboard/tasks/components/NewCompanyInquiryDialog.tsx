// @ts-nocheck
"use client"

import { useState, useCallback, useMemo, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Check, ChevronsUpDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from "@/components/ui/command"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { User, Users, Building2, Loader2, FileText, Briefcase, UserCheck, Shield } from "lucide-react"
import { supabase } from "@/lib/supabase/client"
import { toast } from "@/hooks/use-toast"
import { fetchDepartments } from "../../departments/departments/database"
import { format } from "date-fns"

// Interface for a company
interface Company {
    id: number
    company_name: string
}

// Interface for an official (Director or Shareholder)
interface Official {
    id: number
    full_name: string
    is_current: boolean
    role: string // Distinguishes between Director and Shareholder
}

// Props for the new dialog component
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
    officers = []
}: NewCompanyInquiryDialogProps) {
    // State for company and official selection
    const [companies, setCompanies] = useState<Company[]>([])
    const [selectedCompany, setSelectedCompany] = useState<Company | null>(null)
    const [officials, setOfficials] = useState<Official[]>([])
    const [selectedOfficialIds, setSelectedOfficialIds] = useState<Set<number>>(new Set())

    // Loading states
    const [loadingCompanies, setLoadingCompanies] = useState(false)
    const [loadingOfficials, setLoadingOfficials] = useState(false)
    const [loading, setLoading] = useState(false)
    const [loadingStaff, setLoadingStaff] = useState(false)

    // State for UI components
    const [isCompanyPopoverOpen, setIsCompanyPopoverOpen] = useState(false)

    // Reused state from the original component
    const [departments, setDepartments] = useState<any[]>(propDepartments || [])
    const [localUsers, setLocalUsers] = useState<any[]>(users || [])
    const [localOfficers, setLocalOfficers] = useState<any[]>(officers || [])
    const [taskType, setTaskType] = useState<'new' | 'renewal'>('new')
    const [availableOfficers, setAvailableOfficers] = useState([])
    const [availableManagers, setAvailableManagers] = useState([])
    const [availableAssistants, setAvailableAssistants] = useState([])
    const [formData, setFormData] = useState({
        job_description: '',
        department_id: selectedDepartmentId || '',
        subdepartment_id: selectedSubdepartmentId || '',
        class_id: selectedClassId || '',
        subclass_id: '',
        officer_id: '',
        task_manager_id: '',
        task_assistant_id: '',
        enquiry_date: new Date().toISOString().split('T')[0]
    })

    // Fetch all companies
    const loadCompanies = useCallback(async () => {
        console.log('🏢 [LOG] Fetching companies...');
        setLoadingCompanies(true);
        try {
            const { data, error } = await supabase
                .from('acc_portal_company_duplicate')
                .select('id, company_name')
                .order('company_name');

            if (error) throw error;
            setCompanies(data || []);
            console.log(`✅ [LOG] Found ${data?.length || 0} companies.`);
        } catch (error) {
            console.error('❌ [LOG] Error fetching companies:', error);
            toast({ title: "Error", description: "Failed to load companies.", variant: "destructive" });
        } finally {
            setLoadingCompanies(false);
        }
    }, []);

    // Fetch officials (directors/shareholders) for a given company
    const fetchOfficials = useCallback(async (companyId: number) => {
        console.log(`👨‍💼 [LOG] Fetching officials for company ID: ${companyId}`);
        setLoadingOfficials(true);
        setOfficials([]);
        setSelectedOfficialIds(new Set());
        try {
            const { data, error } = await supabase
                .from('registry_individuals')
                .select('id, full_name, employment_data')
                .order('full_name');

            if (error) throw error;

            const associatedOfficials: Official[] = [];
            (data || []).forEach(individual => {
                const associations = individual.employment_data?.associations || [];
                
                // *** KEY CHANGE HERE ***
                // Filter associations where company_id (string) matches the selected companyId (number)
                // and the role is either Director or Shareholder.
                const relevantAssociations = associations.filter(assoc =>
                    assoc.company_id?.toString() === companyId.toString() && // Convert both to string for safe comparison
                    (assoc.individual_type === 'Director' || assoc.individual_type === 'Shareholder')
                );

                relevantAssociations.forEach(relevantAssociation => {
                    associatedOfficials.push({
                        id: individual.id,
                        full_name: individual.full_name,
                        is_current: relevantAssociation.is_current === true,
                        role: relevantAssociation.individual_type // Store the role
                    });
                })
            });

            // Remove duplicates in case an individual is both a Director and Shareholder for the same company
            const uniqueOfficials = Array.from(new Map(associatedOfficials.map(item => [item.id, item])).values());

            console.log(`✅ [LOG] Found ${uniqueOfficials.length} officials for the selected company.`);
            setOfficials(uniqueOfficials);

            // Pre-select active officials
            const activeOfficialIds = uniqueOfficials
                .filter(d => d.is_current)
                .map(d => d.id);
            setSelectedOfficialIds(new Set(activeOfficialIds));
            console.log(`👍 [LOG] Pre-selected ${activeOfficialIds.length} active officials.`);

        } catch (error) {
            console.error('❌ [LOG] Error fetching officials:', error);
            toast({ title: "Error", description: "Failed to load officials for this company.", variant: "destructive" });
        } finally {
            setLoadingOfficials(false);
        }
    }, []);

    // Sync departments state with propDepartments
    useEffect(() => {
        if (propDepartments && propDepartments.length > 0) {
            setDepartments(propDepartments);
        }
    }, [propDepartments]);

    // Effect to handle department, subdepartment, and class selection
    useEffect(() => {
                
        if (open) {
            if (selectedDepartmentId) {
               
                // Find the selected department, subdepartment, and class
                const department = propDepartments.find(d => 
                    String(d.id) === String(selectedDepartmentId) || d.id === Number(selectedDepartmentId)
                );
               
                let subdepartment = null;
                let selectedClass = null;
                
                if (department?.tm_subdepartments) {
                    
                    if (selectedSubdepartmentId) {
                        subdepartment = department.tm_subdepartments.find((sd: any) => 
                            String(sd.id) === String(selectedSubdepartmentId) || sd.id === Number(selectedSubdepartmentId)
                        );
                        
                        if (subdepartment?.classes && selectedClassId) {
                                                     
                            // Search in both main classes and their subclasses
                            const findClass = (classes: any[], targetId: string | number): any => {
                                for (const cls of classes) {
                                    if (String(cls.id) === String(targetId) || cls.id === Number(targetId)) {
                                        return cls;
                                    }
                                    if (cls.subClasses?.length) {
                                        const found = findClass(cls.subClasses, targetId);
                                        if (found) return found;
                                    }
                                }
                                return null;
                            };
                            
                            selectedClass = findClass(subdepartment.classes, selectedClassId);
                             
                            // If the selected class has subclasses, auto-select the first one
                            if (selectedClass?.subClasses?.length > 0) {
                                const firstSubclass = selectedClass.subClasses[0];
                                setFormData(prev => ({
                                    ...prev,
                                    class_id: selectedClass.id.toString(),
                                    subclass_id: firstSubclass.id.toString()
                                }));
                            } else if (selectedClass) {
                                setFormData(prev => ({
                                    ...prev,
                                    class_id: selectedClass.id.toString(),
                                    subclass_id: ''
                                }));
                            }
                        }
                    }
                }
                
                setFormData(prev => {
                    const newData = {
                        ...prev,
                        department_id: String(selectedDepartmentId),
                        subdepartment_id: subdepartment ? String(subdepartment.id) : '',
                        class_id: selectedClass ? String(selectedClass.id) : '',
                        subclass_id: '' // Reset subclass when class changes
                    };
                    return newData;
                });
            } else {
                console.warn('⚠️ [NewCompanyInquiryDialog] No selectedDepartmentId provided');
            }
            
            if (companies.length === 0) {
               loadCompanies();
            }   
        }
    }, [open, selectedDepartmentId, companies.length, loadCompanies]);

    // Effect to fetch officials when a company is selected
    useEffect(() => {
        if (selectedCompany) {
            fetchOfficials(selectedCompany.id);
        } else {
            // Clear officials if no company is selected
            setOfficials([]);
            setSelectedOfficialIds(new Set());
        }
    }, [selectedCompany, fetchOfficials]);


    // Handle form field changes
    const handleChange = useCallback((field: keyof typeof formData, value: any) => {
        setFormData(prev => {
            const newState = { ...prev };
            
            if (field === 'department_id') {
                newState.department_id = value;
                newState.subdepartment_id = '';
                newState.class_id = '';
                newState.subclass_id = '';
                newState.officer_id = '';
                newState.task_manager_id = '';
                newState.task_assistant_id = '';
            } 
            else if (field === 'subdepartment_id') {
                newState.subdepartment_id = value;
                newState.class_id = '';
                newState.subclass_id = '';
                newState.officer_id = '';
                newState.task_manager_id = '';
                newState.task_assistant_id = '';
            } 
            else if (field === 'class_id') {
                newState.class_id = value;
                newState.subclass_id = '';
            } 
            else if (field === 'subclass_id') {
                newState.subclass_id = value;
            }
            else if (field === 'task_manager_id') {
                newState.task_manager_id = value;
                newState.task_assistant_id = '';
            } 
            else {
                newState[field] = value;
            }
                        return { ...newState }; // Return a new object to ensure re-render
        });
    }, [formData]);

    const loadStaffData = useCallback(async () => {
        setLoadingStaff(true);
        try {
            const [usersResult, officersResult] = await Promise.all([
                supabase.from('tm_users').select('*').order('name'),
                supabase.from('tm_users').select('*').eq('role', 'officer').order('name')
            ]);
            if (usersResult.error) throw usersResult.error;
            if (officersResult.error) throw officersResult.error;
            setLocalUsers(usersResult.data || []);
            setLocalOfficers(officersResult.data || []);
        } catch (error) {
            toast({ title: "Error", description: "Failed to load staff data", variant: "destructive" });
        } finally {
            setLoadingStaff(false);
        }
    }, []);

    useEffect(() => {
        if (!open) return;
        if ((users.length > 0) && (officers.length > 0)) {
            setLocalUsers(users);
            setLocalOfficers(officers);
        } else if (localUsers.length === 0 || localOfficers.length === 0) {
            loadStaffData();
        }
    }, [open, users, officers, localUsers.length, localOfficers.length, loadStaffData]);


    const findActiveStaffForSubdept = useCallback((subdept, allUsers, allOfficers) => {
        if (!subdept || !allUsers || !allOfficers) return { officers: [], managers: [], assistants: [] };
        const getActiveUserIds = (historyArray) => (historyArray || []).filter(item => item && !item.end_date).map(item => item.id).filter(Boolean);
        const activeOfficerIds = getActiveUserIds(subdept.officer_history);
        const activeManagerIds = getActiveUserIds(subdept.manager_history);
        if (activeOfficerIds.length === 0 && activeManagerIds.length === 0) {
            return {
                officers: allOfficers,
                managers: allUsers.filter(u => u.role === 'user' || u.role === 'admin'),
                assistants: allUsers.filter(u => u.role === 'user')
            };
        }
        return {
            officers: allOfficers.filter(o => activeOfficerIds.includes(o.id)),
            managers: allUsers.filter(u => activeManagerIds.includes(u.id)),
            assistants: [] // Determined by manager selection
        };
    }, []);

    useEffect(() => {
        console.log('🔔 [LOG] useEffect for subdepartment changes triggered');
        console.log('   [LOG] Open state:', open);
        console.log('   [LOG] Current subdepartment_id:', formData.subdepartment_id);
        console.log('   [LOG] Local users count:', localUsers.length);
        
        if (!open || !formData.subdepartment_id || localUsers.length === 0) {
            console.log('   [LOG] Early return - conditions not met:', {
                isOpen: open,
                hasSubdepartment: !!formData.subdepartment_id,
                hasLocalUsers: localUsers.length > 0
            });
            return;
        }
        
        console.log('   [LOG] Finding department with ID:', formData.department_id);
        const dept = departments.find(d => d.id.toString() === formData.department_id);
        console.log('   [LOG] Found department:', dept ? dept.name : 'Not found');
        
        if (dept?.tm_subdepartments) {
            console.log('   [LOG] Available subdepartments in department:', 
                dept.tm_subdepartments.map((s: any) => ({ id: s.id, name: s.name })));
        }
        
        const subdept = dept?.tm_subdepartments?.find((s: any) => s.id.toString() === formData.subdepartment_id);
        console.log('   [LOG] Found subdepartment:', subdept ? subdept.name : 'Not found');
        
        if (subdept) {
            console.log('   [LOG] Finding active staff for subdepartment...');
            const activeStaff = findActiveStaffForSubdept(subdept, localUsers, localOfficers);
            console.log('   [LOG] Found active staff:', {
                officers: activeStaff.officers.length,
                managers: activeStaff.managers.length,
                assistants: activeStaff.assistants.length
            });
            
            setAvailableOfficers(activeStaff.officers);
            setAvailableManagers(activeStaff.managers);
            setAvailableAssistants([]);
            setFormData(prev => ({ ...prev, officer_id: '', task_manager_id: '', task_assistant_id: '' }));
        } else {
            console.log('❌ [LOG] No matching subdepartment found');
        }
    }, [open, formData.subdepartment_id, localUsers, localOfficers, departments, formData.department_id, findActiveStaffForSubdept]);

    useEffect(() => {
        if (!formData.task_manager_id) {
            setAvailableAssistants([]);
            return;
        }
        console.log('🔔 [LOG] useEffect for task manager changes triggered');
        console.log('   [LOG] Open state:', open);
        console.log('   [LOG] Current task_manager_id:', formData.task_manager_id);
        console.log('   [LOG] Local users count:', localUsers.length);
        
        if (!open || !formData.task_manager_id || localUsers.length === 0) {
            console.log('   [LOG] Early return - conditions not met:', {
                isOpen: open,
                hasTaskManager: !!formData.task_manager_id,
                hasLocalUsers: localUsers.length > 0
            });
            return;
        }
        
        console.log('   [LOG] Finding department with ID:', formData.department_id);
        const dept = departments.find(d => d.id.toString() === formData.department_id);
        console.log('   [LOG] Found department:', dept ? dept.name : 'Not found');
        
        if (dept?.tm_subdepartments) {
            console.log('   [LOG] Available subdepartments in department:', 
                dept.tm_subdepartments.map((s: any) => ({ id: s.id, name: s.name })));
        }
        
        const subdept = dept?.tm_subdepartments?.find((s: any) => s.id.toString() === formData.subdepartment_id);
        console.log('   [LOG] Found subdepartment:', subdept ? subdept.name : 'Not found');
        
        if (subdept) {
            console.log('   [LOG] Finding assistants for task manager...');
            const assistantsForManager = subdept.assistant_history?.filter(a => !a.end_date && a.manager_id?.toString() === formData.task_manager_id).map(a => a.id) || [];
            console.log('   [LOG] Found assistants:', assistantsForManager);
            
            setAvailableAssistants(localUsers.filter(user => assistantsForManager.includes(user.id)));
        } else {
            console.log('❌ [LOG] No matching subdepartment found');
        }
    }, [formData.task_manager_id, formData.subdepartment_id, departments, localUsers, formData.department_id]);

    const availableSubdepartments = useMemo(() => {
        console.log('🔍 [LOG] Calculating availableSubdepartments...');
        console.log('   [LOG] Current department_id:', formData.department_id);
        console.log('   [LOG] Available departments:', departments.map(d => ({ id: d.id, name: d.name })));
        
        if (!formData.department_id) {
            console.log('   [LOG] No department selected, returning empty array');
            return [];
        }
        
        const dept = departments.find(d => 
            String(d.id) === String(formData.department_id) || d.id === Number(formData.department_id)
        );
        const subdepts = dept?.tm_subdepartments || [];
        
        console.log('   [LOG] Found department:', dept ? dept.name : 'Not found');
        console.log('   [LOG] Available subdepartments:', subdepts.map((s: any) => ({ id: s.id, name: s.name })));
        
        return subdepts;
    }, [departments, formData.department_id]);

    // Get main classes (without subclasses)
    const availableClasses = useMemo(() => {
        if (!formData.subdepartment_id) return [];
        const subdept = availableSubdepartments.find(s => 
            String(s.id) === String(formData.subdepartment_id) || s.id === Number(formData.subdepartment_id)
        );
        console.log('   [LOG] Found subdepartment for classes:', subdept ? subdept.name : 'Not found');
        
        const mainClasses = subdept?.classes?.filter(cls => !cls.parentId) || [];
        
        console.log('   [LOG] Available main classes:', mainClasses.map((c: any) => ({
            id: c.id,
            name: c.name,
            hasSubclasses: c.subClasses?.length > 0
        })));
        
        return mainClasses;
    }, [availableSubdepartments, formData.subdepartment_id]);
    
    // Get subclasses for the selected class
    const availableSubclasses = useMemo(() => {
        if (!formData.class_id) return [];
        
        const subdept = availableSubdepartments.find(s => 
            String(s.id) === String(formData.subdepartment_id) || s.id === Number(formData.subdepartment_id)
        );
        
        if (!subdept?.classes) return [];
        
        // Find the selected class and return its subclasses
        const findClass = (classes: any[]): any[] => {
            for (const cls of classes) {
                if (String(cls.id) === String(formData.class_id) || cls.id === Number(formData.class_id)) {
                    return cls.subClasses || [];
                }
                if (cls.subClasses?.length) {
                    const found = findClass(cls.subClasses);
                    if (found) return found;
                }
            }
            return [];
        };
        
        const subclasses = findClass(subdept.classes);
        console.log('   [LOG] Available subclasses:', subclasses.map((c: any) => ({
            id: c.id,
            name: c.name
        })));
        
        return subclasses;
    }, [availableSubdepartments, formData.subdepartment_id, formData.class_id]);
    
    // Auto-select the first subclass when they become available
    useEffect(() => {
        if (formData.class_id && availableSubclasses.length > 0 && !formData.subclass_id) {
            console.log('   [LOG] Auto-selecting first subclass:', availableSubclasses[0].name);
            handleChange('subclass_id', availableSubclasses[0].id.toString());
        }
    }, [availableSubclasses, formData.class_id, formData.subclass_id]);
    // --- End of Reused Logic ---


    const handleOfficialSelection = (officialId: number) => {
        setSelectedOfficialIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(officialId)) {
                newSet.delete(officialId);
            } else {
                newSet.add(officialId);
            }
            return newSet;
        });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        console.log('🔹 [NewCompanyInquiryDialog] Form submitted');
        console.log('   [NewCompanyInquiryDialog] Selected company:', selectedCompany);
        console.log('   [NewCompanyInquiryDialog] Form data:', formData);
        
        if (!selectedCompany) {
            console.error('❌ [NewCompanyInquiryDialog] No company selected');
            toast({ title: "Validation Error", description: "Please select a company.", variant: "destructive" });
            return;
        }
        if (selectedOfficialIds.size === 0) {
            toast({ title: "Validation Error", description: "Please select at least one official.", variant: "destructive" });
            return;
        }
        setLoading(true);
        console.log("🚀 [LOG] Creating company enquiry...");

        try {
            const now = new Date();
            const enquiryStageId = '1e6ebd85-db1e-4eb9-abb6-5fc145ac8caa'; // Static ID for "Enquiry" stage
            const initialStages = {
                [enquiryStageId]: {
                    date: format(now, 'dd/MM/yyyy'),
                    status: 'completed',
                    completedAt: now.toISOString(),
                },
            };

            const directorsDetails = Array.from(selectedOfficialIds).map(officialId => {
                const official = officials.find(o => o.id === officialId);
                return {
                    id: official?.id,
                    full_name: official?.full_name,
                    role: official?.role
                };
            });

            const taskToCreate = {
                job_description: formData.job_description || '',
                status: 'enquiry',
                renewal_status: taskType,
                department_id: formData.department_id,
                subdepartment_id: formData.subdepartment_id,
                applicant_type: 'company',
                class_id: formData.class_id || null,
                subclass_id: formData.subclass_id || null,
                date_initiated: new Date(formData.enquiry_date),
                applicant_name: selectedCompany.company_name,
                company_id: selectedCompany.id,
                stages: initialStages,
                officer_id: formData.officer_id || null,
                task_manager_id: formData.task_manager_id || null,
                task_assistant_id: formData.task_assistant_id || null,
                directors_details: directorsDetails
            };

            console.log(`📦 [LOG] Submitting task to Supabase.`);
            const { data, error } = await supabase.from('tm_tasks_duplicate').insert([taskToCreate]).select();

            if (error) throw error;

            console.log('✅ [LOG] Enquiry created successfully!', data);
            toast({ title: 'Success', description: `Enquiry for ${selectedCompany.company_name} created successfully.` });
            onEnquiryCreated(data);
            resetForm();
            onOpenChange(false);

        } catch (error) {
            console.error('❌ [LOG] Error creating enquiry:', error);
            toast({ title: 'Error', description: error instanceof Error ? error.message : 'Failed to create enquiry', variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    };

    const resetForm = () => {
        console.log("🧹 [NewCompanyInquiryDialog] Resetting form");
        console.log('   [NewCompanyInquiryDialog] Current state before reset:', { 
            selectedCompany, 
            officials, 
            selectedOfficialIds: Array.from(selectedOfficialIds),
            formData 
        });
        setSelectedCompany(null);
        setOfficials([]);
        setSelectedOfficialIds(new Set());
        setTaskType('new');
        setFormData({
            job_description: '',
            department_id: '',
            subdepartment_id: '',
            class_id: '',
            subclass_id: '',
            officer_id: '',
            task_manager_id: '',
            task_assistant_id: '',
            enquiry_date: new Date().toISOString().split('T')[0]
        });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>New Company Enquiry</DialogTitle>
                    <DialogDescription>
                        Create a single task for a company, including selected directors or shareholders.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Left Column - Company & Official Selection */}
                        <div className="lg:col-span-1 space-y-6">
                            <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2"><Building2 className="h-4 w-4" /> Select Company</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <Popover open={isCompanyPopoverOpen} onOpenChange={setIsCompanyPopoverOpen}>
                                        <PopoverTrigger asChild>
                                            <Button variant="outline" role="combobox" className={cn("w-full justify-between", !selectedCompany && "text-muted-foreground")}>
                                                {selectedCompany ? selectedCompany.company_name : "Select company..."}
                                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                                            <Command>
                                                <CommandInput placeholder="Search company..." />
                                                <CommandEmpty>No company found.</CommandEmpty>
                                                <CommandGroup className="max-h-60 overflow-auto">
                                                    {loadingCompanies ? (
                                                        <div className="flex justify-center p-2"><Loader2 className="h-5 w-5 animate-spin" /></div>
                                                    ) : companies.map((company) => (
                                                        <CommandItem
                                                            value={company.company_name}
                                                            key={company.id}
                                                            onSelect={() => {
                                                                setSelectedCompany(company);
                                                                setIsCompanyPopoverOpen(false);
                                                            }}
                                                        >
                                                            {company.company_name}
                                                            <Check className={cn("ml-auto h-4 w-4", selectedCompany?.id === company.id ? "opacity-100" : "opacity-0")} />
                                                        </CommandItem>
                                                    ))}
                                                </CommandGroup>
                                            </Command>
                                        </PopoverContent>
                                    </Popover>
                                </CardContent>
                            </Card>

                            {selectedCompany && (
                                <Card>
                                    <CardHeader>
                                        <CardTitle className="flex items-center gap-2"><Users className="h-4 w-4" /> Select Officials</CardTitle>
                                        <CardDescription>Select the directors and shareholders to include in the enquiry.</CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        {loadingOfficials ? (
                                            <div className="flex items-center justify-center p-4">
                                                <Loader2 className="h-5 w-5 animate-spin text-gray-500" />
                                            </div>
                                        ) : officials.length > 0 ? (
                                            <div className="mt-2 space-y-2 max-h-80 overflow-y-auto border rounded-md p-2">
                                                {officials.map((official) => (
                                                    <div key={official.id} className="flex items-center space-x-2 p-1 hover:bg-gray-50 rounded">
                                                        <input
                                                            type="checkbox"
                                                            id={`official-${official.id}`}
                                                            checked={selectedOfficialIds.has(official.id)}
                                                            onChange={() => handleOfficialSelection(official.id)}
                                                            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                                        />
                                                        <label htmlFor={`official-${official.id}`} className="text-sm flex-1 flex justify-between items-center cursor-pointer">
                                                            <span>{official.full_name}</span>
                                                            <div className="flex items-center gap-2">
                                                                <Badge variant="secondary" className="text-xs">{official.role}</Badge>
                                                                {official.is_current && <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">Active</Badge>}
                                                            </div>
                                                        </label>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="text-sm text-center text-gray-500 py-4">No directors or shareholders found.</p>
                                        )}
                                    </CardContent>
                                </Card>
                            )}
                        </div>

                        {/* Right Column - Enquiry & Assignment Details (unchanged) */}
                        <div className="lg:col-span-2 space-y-6">
                            <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2"><FileText className="h-4 w-4" /> Enquiry Details</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <Label htmlFor="task-type">Task Type <span className="text-red-500">*</span></Label>
                                            <Select value={taskType} onValueChange={(v: 'new' | 'renewal') => setTaskType(v)}>
                                                <SelectTrigger><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="new">New</SelectItem>
                                                    <SelectItem value="renewal">Renewal</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div>
                                            <Label htmlFor="enquiry-date">Enquiry Date <span className="text-red-500">*</span></Label>
                                            <Input id="enquiry-date" type="date" value={formData.enquiry_date} onChange={(e) => setFormData(p => ({ ...p, enquiry_date: e.target.value }))} required />
                                        </div>
                                    </div>
                                    <div>
                                        <Label htmlFor="job-description">Job Description <span className="text-red-500">*</span></Label>
                                        <Textarea id="job-description" value={formData.job_description} onChange={(e) => setFormData(p => ({ ...p, job_description: e.target.value }))} placeholder="Describe the enquiry..." required />
                                    </div>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2"><Briefcase className="h-4 w-4" /> Department & Classification</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <Label>Department <span className="text-red-500">*</span></Label>
                                            <Select value={formData.department_id} onValueChange={(v) => handleChange('department_id', v)} disabled={departments.length === 0}>
                                                <SelectTrigger><SelectValue placeholder="Select department..." /></SelectTrigger>
                                                <SelectContent>{departments.map(d => <SelectItem key={d.id} value={d.id.toString()}>{d.name}</SelectItem>)}</SelectContent>
                                            </Select>
                                        </div>
                                        <div>
                                            <Label>Subdepartment</Label>
                                            <Select value={formData.subdepartment_id} onValueChange={(v) => handleChange('subdepartment_id', v)} disabled={!formData.department_id}>
                                                <SelectTrigger><SelectValue placeholder="Select subdepartment..." /></SelectTrigger>
                                                <SelectContent>{availableSubdepartments.map(sd => <SelectItem key={sd.id} value={sd.id.toString()}>{sd.name}</SelectItem>)}</SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <Label>Class</Label>
                                            <Select 
                                                value={formData.class_id} 
                                                onValueChange={(v) => {
                                                    // When class changes, update class and auto-select first subclass if available
                                                    handleChange('class_id', v);
                                                    
                                                    // Find the selected class
                                                    const selectedClass = availableClasses.find(c => c.id.toString() === v);
                                                    
                                                    // If class has subclasses, auto-select the first one
                                                    if (selectedClass?.subClasses?.length > 0) {
                                                        handleChange('subclass_id', selectedClass.subClasses[0].id.toString());
                                                    } else {
                                                        handleChange('subclass_id', '');
                                                    }
                                                }} 
                                                disabled={!formData.subdepartment_id}
                                            >
                                                <SelectTrigger><SelectValue placeholder="Select class..." /></SelectTrigger>
                                                <SelectContent>
                                                    {availableClasses.map(c => (
                                                        <SelectItem key={c.id} value={c.id.toString()}>
                                                            {c.name}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div>
                                            <Label>Subclass</Label>
                                            <Select 
                                                value={formData.subclass_id} 
                                                onValueChange={(v) => handleChange('subclass_id', v)} 
                                                disabled={!formData.class_id || availableSubclasses.length === 0}
                                            >
                                                <SelectTrigger>
                                                    <SelectValue placeholder={
                                                        availableSubclasses.length > 0 
                                                            ? "Select subclass..." 
                                                            : "No subclasses available"
                                                    } />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {availableSubclasses.map(sc => (
                                                        <SelectItem key={sc.id} value={sc.id.toString()}>
                                                            {sc.name}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2"><Shield className="h-4 w-4" /> Staff Assignment</CardTitle>
                                    <CardDescription>Assign staff based on the selected subdepartment.</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div>
                                        <Label>Officer</Label>
                                        <Select value={formData.officer_id} onValueChange={(v) => handleChange('officer_id', v)} disabled={!formData.subdepartment_id || loadingStaff}>
                                            <SelectTrigger><SelectValue placeholder="Select officer..." /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="none">No Officer</SelectItem>
                                                {availableOfficers.map(o => <SelectItem key={o.id} value={o.id.toString()}>{o.name}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div>
                                        <Label>Task Manager</Label>
                                        <Select value={formData.task_manager_id} onValueChange={(v) => handleChange('task_manager_id', v)} disabled={!formData.subdepartment_id || loadingStaff}>
                                            <SelectTrigger><SelectValue placeholder="Select manager..." /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="none">No Task Manager</SelectItem>
                                                {availableManagers.map(m => <SelectItem key={m.id} value={m.id.toString()}>{m.name}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div>
                                        <Label>Task Assistant</Label>
                                        <Select value={formData.task_assistant_id} onValueChange={(v) => handleChange('task_assistant_id', v)} disabled={!formData.task_manager_id || loadingStaff}>
                                            <SelectTrigger><SelectValue placeholder="Select assistant..." /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="none">No Task Assistant</SelectItem>
                                                {availableAssistants.map(a => <SelectItem key={a.id} value={a.id.toString()}>{a.name}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>Cancel</Button>
                        <Button type="submit" disabled={loading || !selectedCompany || selectedOfficialIds.size === 0}>
                            {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating...</> : `Create Enquiry`}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}