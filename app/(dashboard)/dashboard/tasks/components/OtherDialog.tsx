// @ts-nocheck
"use client"

import { useState, useCallback, useMemo, useEffect } from "react"
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
import { Building2, Loader2, FileText, Briefcase, Shield, User, UserCheck } from "lucide-react"
import { supabase } from "@/lib/supabase/client"
import { toast } from "@/lib/hooks/use-toast"
import { fetchDepartments } from "../../departments/departments/database"
import { format } from "date-fns"

// --- UPDATED INTERFACES ---
// This interface matches the structure of a single reference object in the JSONB array
interface CompanyReference {
    id: string; // The unique ID of the reference link itself (e.g., "ref_...")
    reference_individual_id: string; // The ID of the person who is the reference
    individual_full_name: string; // The name of that person
    relationship: string;
}

// The Company interface now uses the correct CompanyReference type
interface Company {
    id: number
    company_name: string
    reference?: CompanyReference[]
}
// --- END OF UPDATED INTERFACES ---

interface OtherDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onEnquiryCreated: (enquiry: any) => void
    departments: any[]
    users: any[]
    officers: any[]
}

export function OtherDialog({
    open,
    onOpenChange,
    onEnquiryCreated,
    departments: propDepartments = [],
    users = [],
    officers = []
}: OtherDialogProps) {
    const [companies, setCompanies] = useState<Company[]>([])
    const [selectedCompany, setSelectedCompany] = useState<Company | null>(null)
    // --- STATE TYPES UPDATED ---
    const [availableReferences, setAvailableReferences] = useState<CompanyReference[]>([])
    const [selectedReferences, setSelectedReferences] = useState<string[]>([]) // Will store the unique `id` ("ref_...")
    // --- END OF STATE TYPE UPDATES ---
    const [includeReferences, setIncludeReferences] = useState(false)
    const [loadingCompanies, setLoadingCompanies] = useState(false)

    // ... (rest of the state declarations remain the same)
    const [departments, setDepartments] = useState<any[]>(propDepartments || [])
    const [localUsers, setLocalUsers] = useState<any[]>(users || [])
    const [localOfficers, setLocalOfficers] = useState<any[]>(officers || [])
    const [loadingStaff, setLoadingStaff] = useState(false)
    const [loading, setLoading] = useState(false)
    const [availableOfficers, setAvailableOfficers] = useState([])
    const [availableManagers, setAvailableManagers] = useState([])
    const [availableAssistants, setAvailableAssistants] = useState([])
    const [formData, setFormData] = useState({
        company_name: '',
        job_description: '',
        department_id: '',
        subdepartment_id: '',
        class_id: '',
        subclass_id: '',
        department_name: '',
        subdepartment_name: '',
        class_name: '',
        officer_id: '',
        task_manager_id: '',
        task_assistant_id: '',
        applied_by: '',
        enquiry_date: new Date().toISOString().split('T')[0]
    })


    // ... (handleChange, loadStaffData, findActiveStaffForSubdept remain the same)
    const handleChange = useCallback((field: keyof typeof formData, value: any) => {
        setFormData(prev => {
            if (field === 'department_id') {
                return {
                    ...prev,
                    department_id: value,
                    subdepartment_id: '',
                    class_id: '',
                    subclass_id: '',
                    officer_id: '',
                    task_manager_id: '',
                    task_assistant_id: ''
                };
            }
            if (field === 'subdepartment_id') {
                return {
                    ...prev,
                    subdepartment_id: value,
                    class_id: '',
                    subclass_id: '',
                    officer_id: '',
                    task_manager_id: '',
                    task_assistant_id: ''
                };
            }
            if (field === 'class_id') return { ...prev, class_id: value, subclass_id: '' };
            if (field === 'task_manager_id') return { ...prev, task_manager_id: value, task_assistant_id: '' };
            return { ...prev, [field]: value };
        });
    }, []);
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
            console.error('❌ Error loading staff data:', error);
            toast({ title: "Error", description: "Failed to load staff data", variant: "destructive" });
        } finally {
            setLoadingStaff(false);
        }
    }, []);
    const findActiveStaffForSubdept = useCallback((subdept, allUsers, allOfficers) => {
        if (!subdept || !allUsers || !allOfficers) return { officers: [], managers: [], assistants: [] };
        const getActiveUserIds = (historyArray) => (historyArray || []).filter(item => item && !item.end_date).map(item => item.id).filter(Boolean);
        const activeOfficerIds = getActiveUserIds(subdept.officer_history);
        const activeManagerIds = getActiveUserIds(subdept.manager_history);
        const activeAssistantIds = getActiveUserIds(subdept.assistant_history);
        const hasSpecificAssignments = activeOfficerIds.length > 0 || activeManagerIds.length > 0 || activeAssistantIds.length > 0;
        if (!hasSpecificAssignments) return { officers: allOfficers, managers: allUsers.filter(u => u.role === 'user' || u.role === 'admin'), assistants: allUsers.filter(u => u.role === 'user') };
        return {
            officers: allOfficers.filter(o => activeOfficerIds.includes(o.id)),
            managers: allUsers.filter(u => activeManagerIds.includes(u.id)),
            assistants: allUsers.filter(u => activeAssistantIds.includes(u.id)),
        };
    }, []);

    const fetchCompanies = useCallback(async () => {
        setLoadingCompanies(true);
        try {
            const { data, error } = await supabase
                .from('acc_portal_company_duplicate')
                .select('id, company_name, reference')
                .order('company_name');

            if (error) throw error;
            setCompanies(data || []);
        } catch (error) {
            console.error('Error fetching companies:', error);
            toast({ title: "Error", description: "Failed to load companies", variant: "destructive" });
        } finally {
            setLoadingCompanies(false);
        }
    }, []);

    // --- `handleCompanySelect` UPDATED ---
    const handleCompanySelect = useCallback((company: Company) => {
        setSelectedCompany(company);
        setFormData(prev => ({
            ...prev,
            company_name: company.company_name
        }));

        // The fetched data structure for `reference` should now be correct.
        // We ensure it's a valid array before setting it.
        if (company.reference && Array.isArray(company.reference)) {
            setAvailableReferences(company.reference);
        } else {
            setAvailableReferences([]);
        }

        // Reset selections when a new company is chosen
        setSelectedReferences([]);
        setIncludeReferences(false);
    }, []);

    // ... (useMemo and useEffect hooks remain the same)
    const availableSubdepartments = useMemo(() => {
        if (!formData.department_id) return []
        const dept = departments.find(d => d.id.toString() === formData.department_id)
        return dept?.tm_subdepartments || []
    }, [departments, formData.department_id])
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
    const usersWithRoleUser = useMemo(() => {
        return localUsers.filter(user => user.role === 'user')
    }, [localUsers])
    useEffect(() => {
        if (!open) return;
        if ((users && users.length > 0) && (officers && officers.length > 0)) { setLocalUsers(users); setLocalOfficers(officers); return; }
        if (localUsers.length === 0 || localOfficers.length === 0) { loadStaffData(); }
    }, [open, users, officers, localUsers.length, localOfficers.length, loadStaffData]);
    useEffect(() => {
        if (users && users.length > 0) setLocalUsers(users);
        if (officers && officers.length > 0) setLocalOfficers(officers);
    }, [users, officers]);
    useEffect(() => {
        if (!open || !formData.subdepartment_id || localUsers.length === 0 || localOfficers.length === 0) return;
        const dept = departments.find(d => d.id.toString() === formData.department_id);
        const subdept = dept?.tm_subdepartments?.find(s => s.id.toString() === formData.subdepartment_id);
        if (subdept) {
            const activeStaff = findActiveStaffForSubdept(subdept, localUsers, localOfficers);
            setAvailableOfficers(activeStaff.officers);
            setAvailableManagers(activeStaff.managers);
            setAvailableAssistants([]);
            setFormData(prev => ({ ...prev, officer_id: '', task_manager_id: '', task_assistant_id: '' }));
        }
    }, [open, formData.subdepartment_id, localUsers.length, localOfficers.length, departments.length, findActiveStaffForSubdept]);
    useEffect(() => {
        if (!open || !formData.subdepartment_id || !formData.task_manager_id) {
            setAvailableAssistants([]);
            setFormData(prev => ({ ...prev, task_assistant_id: '' }));
            return;
        }
        const filterAssistantsByManager = () => {
            const dept = departments.find(d => d.id.toString() === formData.department_id);
            const subdept = dept?.tm_subdepartments?.find(s => s.id.toString() === formData.subdepartment_id);
            if (!subdept) return;
            const assistantsForManager = subdept.assistant_history?.filter(assistant => !assistant.end_date && assistant.manager_id?.toString() === formData.task_manager_id)?.map(assistant => assistant.id) || [];
            const availableAssistants = localUsers.filter(user => assistantsForManager.includes(user.id));
            setAvailableAssistants(availableAssistants);
            setFormData(prev => ({ ...prev, task_assistant_id: '' }));
        };
        filterAssistantsByManager();
    }, [formData.task_manager_id, formData.subdepartment_id, departments.length, localUsers.length]);
    useEffect(() => {
        const loadDepartments = async () => {
            try {
                if (propDepartments && propDepartments.length > 0) { setDepartments(propDepartments); }
                else { const depts = await fetchDepartments(); setDepartments(depts); }
            } catch (error) { console.error('Error loading departments:', error); }
        }
        if (open && departments.length === 0) loadDepartments();
    }, [open, departments.length, propDepartments]);
    useEffect(() => {
        if (open) fetchCompanies();
    }, [open, fetchCompanies]);

    // --- `handleSubmit` UPDATED ---
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            if (!selectedCompany) throw new Error('Please select a company.');
            if (!formData.applied_by) throw new Error('Please select who applied for this enquiry.');

            // Prepare reference data correctly
            const referencesToSave = includeReferences
                ? selectedReferences.map(refId => {
                    const reference = availableReferences.find(r => r.id === refId);
                    // Save the individual's ID and name for the task record
                    return reference ? {
                        individual_id: reference.reference_individual_id,
                        name: reference.individual_full_name,
                        relationship: reference.relationship,
                    } : null;
                }).filter(Boolean) // Remove any nulls if a reference wasn't found
                : [];

            const now = new Date();
            const enquiryStageId = '1e6ebd85-db1e-4eb9-abb6-5fc145ac8caa';
            const initialStages = {
                [enquiryStageId]: {
                    date: format(now, 'dd/MM/yyyy'),
                    status: 'completed',
                    completedAt: now.toISOString(),
                },
            };

            const taskData: any = {
                job_description: formData.job_description || '',
                status: 'enquiry',
                department_id: formData.department_id,
                subdepartment_id: formData.subdepartment_id,
                class_id: formData.class_id || null,
                subclass_id: formData.subclass_id || null,
                date_initiated: now,
                applicant_name: selectedCompany.company_name,
                company_id: selectedCompany.id,
                stages: initialStages,
                applied_by: formData.applied_by,
                officer_id: formData.officer_id && formData.officer_id !== 'none' ? formData.officer_id : null,
                task_manager_id: formData.task_manager_id && formData.task_manager_id !== 'none' ? formData.task_manager_id : null,
                task_assistant_id: formData.task_assistant_id && formData.task_assistant_id !== 'none' ? formData.task_assistant_id : null,
                // The `references` field is now correctly populated
                references: referencesToSave,
                // Keep a snapshot of company details
                company_details: {
                    id: selectedCompany.id,
                    name: selectedCompany.company_name,
                }
            };

            const { data, error } = await supabase.from('tm_tasks').insert([taskData]).select().single();
            if (error) throw error;

            const { data: fullTask, error: fetchError } = await supabase.from('tm_tasks').select(`*,department:department_id(name),subdepartment:subdepartment_id(name)`).eq('id', data.id).single();
            if (fetchError) console.error('Error fetching task details:', fetchError);

            onEnquiryCreated(fullTask || data);
            resetForm();
            onOpenChange(false);
            toast({ title: 'Success', description: 'Company enquiry created successfully' });
        } catch (error) {
            console.error('Error creating company enquiry:', error);
            toast({ title: 'Error', description: error instanceof Error ? error.message : 'Failed to create enquiry', variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    };

    const resetForm = () => {
        // ... (resetForm remains the same)
        setFormData({ company_name: '', job_description: '', department_id: '', subdepartment_id: '', class_id: '', subclass_id: '', department_name: '', subdepartment_name: '', class_name: '', officer_id: '', task_manager_id: '', task_assistant_id: '', applied_by: '', enquiry_date: new Date().toISOString().split('T')[0] })
        setSelectedCompany(null)
        setAvailableReferences([])
        setSelectedReferences([])
        setIncludeReferences(false)
        setAvailableOfficers([])
        setAvailableManagers([])
        setAvailableAssistants([])
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto border border-gray-200/50 shadow-lg">
                {/* --- DIALOG HEADER AND FORM STRUCTURE REMAINS THE SAME --- */}
                <DialogHeader className="border-b border-gray-200/50 pb-4 bg-white/50">
                    <DialogTitle className="text-2xl font-bold text-gray-900">New Company Enquiry</DialogTitle>
                    <DialogDescription className="text-gray-600">Record a new company enquiry to start the process</DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Left Column */}
                        <div className="lg:col-span-1 space-y-6">
                            {/* Company Selection Card - No changes needed here */}
                            <Card className="border border-gray-200/50 rounded-lg bg-white/50 shadow-sm hover:shadow-md transition-shadow duration-200">
                                <CardHeader className="pb-3 bg-blue-50/50 border-b border-gray-200/50">
                                    <CardTitle className="text-base font-semibold flex items-center gap-2 text-blue-800"><Building2 className="h-4 w-4" />{selectedCompany ? 'Selected Company' : 'Select Company'}</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    {loadingCompanies ? (
                                        <div className="flex items-center justify-center p-4"><Loader2 className="h-5 w-5 animate-spin text-gray-500" /></div>
                                    ) : (
                                        <Popover><PopoverTrigger asChild><Button variant="outline" role="combobox" className={cn("w-full justify-between", !selectedCompany && "text-muted-foreground")}>{selectedCompany ? companies.find((company) => company.id === selectedCompany.id)?.company_name : "Select company..."}<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" /></Button></PopoverTrigger><PopoverContent className="w-full p-0"><Command><CommandInput placeholder="Search companies..." className="h-9" /><CommandEmpty>No company found.</CommandEmpty>
                                            <CommandGroup className="overflow-x-hidden [&_[cmdk-group-items]]:p-1">
                                                <div className="max-h-[300px] max-w-[300px] overflow-y-auto overflow-x-hidden pr-2" onWheel={(e) => e.stopPropagation()}>
                                                    {companies.map((company) => (<CommandItem value={company.company_name} key={company.id} onSelect={() => { handleCompanySelect(company); }}>{company.company_name}<Check className={cn("ml-auto h-4 w-4", selectedCompany?.id === company.id ? "opacity-100" : "opacity-0")} /></CommandItem>))}</div></CommandGroup>
                                        </Command></PopoverContent></Popover>
                                    )}
                                </CardContent>
                            </Card>

                            {/* --- REFERENCES SELECTION CARD - UPDATED --- */}
                            <Card className="border border-gray-200/50 rounded-lg bg-white/50 shadow-sm hover:shadow-md transition-shadow duration-200">
                                <CardHeader className="pb-3 bg-blue-50/50 border-b border-gray-200/50">
                                    <CardTitle className="text-base font-semibold flex items-center gap-2 text-blue-800">
                                        <UserCheck className="h-4 w-4" />References
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-2 pt-2">
                                        {!selectedCompany ? (
                                            <p className="text-sm text-gray-500">Select a company to view references</p>
                                        ) : availableReferences.length > 0 ? (
                                            <div className="space-y-3">
                                                <div>
                                                    <Label htmlFor="references-dropdown" className="text-sm font-medium text-gray-700 mb-1 block">
                                                        Select References
                                                    </Label>
                                                    <Select
                                                        value={selectedReferences[0] || ""}
                                                        onValueChange={(value) => {
                                                            if (value === "") {
                                                                setSelectedReferences([]);
                                                            } else if (!selectedReferences.includes(value)) {
                                                                setSelectedReferences([value]);
                                                            }
                                                        }}
                                                    >
                                                        <SelectTrigger className="w-full">
                                                            <SelectValue placeholder="Select a reference..." />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="none">No reference</SelectItem>
                                                            {availableReferences.map((reference) => (
                                                                <SelectItem
                                                                    key={reference.id}
                                                                    value={reference.id}
                                                                >
                                                                    {reference.individual_full_name} ({reference.relationship})
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                                {selectedReferences.length > 0 && (
                                                    <div className="mt-2 p-3 bg-blue-50 rounded-md border border-blue-100">
                                                        <h4 className="text-sm font-medium text-blue-800 mb-1">Selected Reference:</h4>
                                                        {availableReferences
                                                            .filter(ref => selectedReferences.includes(ref.id))
                                                            .map(ref => (
                                                                <div key={ref.id} className="text-sm text-gray-700">
                                                                    {ref.individual_full_name}
                                                                    <span className="text-xs text-gray-500">({ref.relationship})</span>
                                                                </div>
                                                            ))
                                                        }
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <p className="text-sm text-gray-500">No references available for this company</p>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Applied By Card - No changes needed */}
                            <Card className="border border-gray-200/50 rounded-lg bg-white/50 shadow-sm hover:shadow-md transition-shadow duration-200"><CardHeader className="pb-3 bg-blue-50/50 border-b border-gray-200/50"><CardTitle className="text-base font-semibold flex items-center gap-2 text-blue-800"><User className="h-4 w-4" />Applied By</CardTitle></CardHeader><CardContent><Select value={formData.applied_by} onValueChange={(value) => handleChange('applied_by', value)}><SelectTrigger className="w-full"><SelectValue placeholder="Select who applied..." /></SelectTrigger><SelectContent>{usersWithRoleUser.map((user) => (<SelectItem key={user.id} value={user.id.toString()}>{user.name || user.email}</SelectItem>))}</SelectContent></Select></CardContent></Card>
                        </div>

                        {/* Right Column (Enquiry Details, Dept, Staff) - No changes needed */}
                        <div className="lg:col-span-2 space-y-6">
                            {/* Enquiry Details Card */}
                            <Card className="border border-gray-200/50 rounded-lg bg-white/50 shadow-sm hover:shadow-md transition-shadow duration-200"><CardHeader className="pb-3 bg-blue-50/50 border-b border-gray-200/50"><CardTitle className="text-base font-semibold flex items-center gap-2 text-blue-800"><FileText className="h-4 w-4" />Enquiry Details</CardTitle></CardHeader><CardContent className="space-y-4"><div className="grid grid-cols-1 md:grid-cols-2 gap-4"><div><Label htmlFor="enquiry-date" className="text-sm font-medium">Enquiry Date <span className="text-red-500">*</span></Label><Input id="enquiry-date" type="date" value={formData.enquiry_date} onChange={(e) => handleChange('enquiry_date', e.target.value)} className="mt-1" required /></div></div><div><Label htmlFor="job-description" className="text-sm font-medium">Job Description <span className="text-red-500">*</span></Label><Textarea id="job-description" value={formData.job_description} onChange={(e) => handleChange('job_description', e.target.value)} placeholder="Describe the enquiry details..." className="mt-1 min-h-[100px]" required /></div></CardContent></Card>
                            {/* Department Card */}
                            <Card className="border border-gray-200/50 rounded-lg bg-white/50 shadow-sm hover:shadow-md transition-shadow duration-200">
                                <CardHeader className="pb-3 bg-blue-50/50 border-b border-gray-200/50"><CardTitle className="text-base font-semibold flex items-center gap-2 text-blue-800">
                                    <Building2 className="h-4 w-4" />Department & Classification</CardTitle></CardHeader>
                                <CardContent className="space-y-4"><div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div><Label htmlFor="department" className="text-sm font-medium">Department <span className="text-red-500">*</span></Label>
                                        <Select value={formData.department_id} onValueChange={(value) => { const selectedDept = departments.find(d => d.id.toString() === value); if (selectedDept) { handleChange('department_id', value); handleChange('department_name', selectedDept.name); handleChange('subdepartment_id', ''); } }} disabled={departments.length === 0}><SelectTrigger className="mt-1"><SelectValue placeholder={departments.length === 0 ? "Loading departments..." : "Select department"} /></SelectTrigger><SelectContent>{departments.map((dept) => (<SelectItem key={dept.id} value={dept.id.toString()}>{dept.name}</SelectItem>))}</SelectContent></Select></div><div><Label htmlFor="subdepartment" className="text-sm font-medium">Subdepartment</Label><Select value={formData.subdepartment_id} onValueChange={(value) => { const selectedSubdept = availableSubdepartments.find(sd => sd.id.toString() === value); if (selectedSubdept) { handleChange('subdepartment_id', value); handleChange('subdepartment_name', selectedSubdept.name); } }} disabled={!formData.department_id || availableSubdepartments.length === 0}><SelectTrigger className="mt-1"><SelectValue placeholder={!formData.department_id ? "Select department first" : availableSubdepartments.length === 0 ? "No subdepartments available" : "Select subdepartment"} /></SelectTrigger><SelectContent>{availableSubdepartments.map((subdept) => (<SelectItem key={subdept.id} value={subdept.id.toString()}>{subdept.name}</SelectItem>))}</SelectContent></Select></div></div><div className="grid grid-cols-1 md:grid-cols-2 gap-4"><div><Label htmlFor="class" className="text-sm font-medium">Class</Label><Select value={formData.class_id} onValueChange={(value) => { const selectedClass = availableClasses.find(c => c.id.toString() === value); if (selectedClass) { handleChange('class_id', value); handleChange('class_name', selectedClass.name); } }} disabled={!formData.subdepartment_id || availableClasses.length === 0}><SelectTrigger className="mt-1"><SelectValue placeholder={!formData.subdepartment_id ? "Select subdepartment first" : availableClasses.length === 0 ? "No classes available" : "Select class"} /></SelectTrigger><SelectContent>{availableClasses.map((cls) => (<SelectItem key={cls.id} value={cls.id.toString()}>{cls.name}</SelectItem>))}</SelectContent></Select></div><div><Label htmlFor="subclass" className="text-sm font-medium">Subclass</Label><Select value={formData.subclass_id} onValueChange={(value) => { const selectedSubclass = availableSubclasses.find(sc => sc.id.toString() === value); if (selectedSubclass) { handleChange('subclass_id', value); handleChange('subclass_name', selectedSubclass.name); } }} disabled={!formData.class_id || availableSubclasses.length === 0}><SelectTrigger className="mt-1"><SelectValue placeholder={!formData.class_id ? "Select class first" : availableSubclasses.length === 0 ? "No subclasses available" : "Select subclass"} /></SelectTrigger><SelectContent>{availableSubclasses.map((subclass) => (<SelectItem key={subclass.id} value={subclass.id.toString()}>{subclass.name}</SelectItem>))}</SelectContent></Select></div></div></CardContent></Card>
                            {/* Staff Assignment Card */}
                            <Card className="border border-gray-200/50 rounded-lg bg-white/50 shadow-sm hover:shadow-md transition-shadow duration-200"><CardHeader className="pb-3 bg-blue-50/50 border-b border-gray-200/50"><CardTitle className="text-base font-semibold flex items-center gap-2 text-blue-800"><Shield className="h-4 w-4" />Staff Assignment</CardTitle><CardDescription className="text-blue-600 text-xs">{!formData.subdepartment_id ? "Select a subdepartment first to see available staff" : "Staff filtered based on subdepartment assignments"}</CardDescription></CardHeader><CardContent className="space-y-4"><div className="space-y-2"><Label className="text-xs font-medium flex items-center"><Shield className="w-3 h-3 mr-1" />Officer{formData.subdepartment_id && (<span className="ml-2 text-xs text-slate-500">({availableOfficers.length} available)</span>)}</Label><Select value={formData.officer_id} onValueChange={(value) => handleChange('officer_id', value)} disabled={!formData.subdepartment_id || loadingStaff}><SelectTrigger className="w-full h-8 text-xs"><SelectValue placeholder={!formData.subdepartment_id ? "Select subdepartment first" : loadingStaff ? "Loading..." : "Select officer"} /></SelectTrigger><SelectContent><SelectItem value="none">No Officer</SelectItem>{availableOfficers.map((officer) => (<SelectItem key={officer.id} value={officer.id.toString()}>{officer.name || officer.email}</SelectItem>))}</SelectContent></Select>{formData.subdepartment_id && availableOfficers.length === 0 && !loadingStaff && (<p className="text-xs text-amber-600">No officers assigned to this subdepartment.</p>)}</div><div className="space-y-2"><Label className="text-xs font-medium flex items-center"><User className="w-3 h-3 mr-1" />Task Manager{formData.subdepartment_id && (<span className="ml-2 text-xs text-slate-500">({availableManagers.length} available)</span>)}</Label><Select value={formData.task_manager_id} onValueChange={(value) => handleChange('task_manager_id', value)} disabled={!formData.subdepartment_id || loadingStaff}><SelectTrigger className="w-full h-8 text-xs"><SelectValue placeholder={!formData.subdepartment_id ? "Select subdepartment first" : loadingStaff ? "Loading..." : "Select task manager"} /></SelectTrigger><SelectContent><SelectItem value="none">No Task Manager</SelectItem>{availableManagers.map((manager) => (<SelectItem key={manager.id} value={manager.id.toString()}>{manager.name || manager.email}</SelectItem>))}</SelectContent></Select>{formData.subdepartment_id && availableManagers.length === 0 && !loadingStaff && (<p className="text-xs text-amber-600">No managers assigned to this subdepartment.</p>)}</div><div className="space-y-2"><Label className="text-xs font-medium flex items-center"><UserCheck className="w-3 h-3 mr-1" />Task Assistant{formData.task_manager_id && (<span className="ml-2 text-xs text-slate-500">({availableAssistants.length} available for selected manager)</span>)}</Label><Select value={formData.task_assistant_id} onValueChange={(value) => handleChange('task_assistant_id', value)} disabled={!formData.task_manager_id || loadingStaff}><SelectTrigger className="w-full h-8 text-xs"><SelectValue placeholder={!formData.subdepartment_id ? "Select subdepartment first" : !formData.task_manager_id ? "Select a manager first" : loadingStaff ? "Loading..." : availableAssistants.length === 0 ? "No assistants available for this manager" : "Select task assistant"} /></SelectTrigger><SelectContent><SelectItem value="none">No Task Assistant</SelectItem>{availableAssistants.map((assistant) => (<SelectItem key={assistant.id} value={assistant.id.toString()}>{assistant.name || assistant.email}</SelectItem>))}</SelectContent></Select>{!formData.task_manager_id ? (<p className="text-xs text-blue-500">Select a manager to see available assistants</p>) : formData.task_manager_id && availableAssistants.length === 0 && !loadingStaff ? (<p className="text-xs text-amber-600">No assistants are linked to the selected manager in this subdepartment.</p>) : null}</div></CardContent></Card>
                        </div>
                    </div>

                    {/* Dialog Footer - No changes needed */}
                    <DialogFooter className="border-t border-gray-200/50 pt-4 bg-white/50 flex flex-col sm:flex-row sm:justify-between gap-3 flex-end"><div className="flex flex-col sm:flex-row sm:justify-between gap-3"><Button type="button" variant="outline" className="border-blue-500 hover:bg-blue-50 text-blue-700 hover:text-blue-900" onClick={() => { resetForm(); onOpenChange(false); }} disabled={loading}>Cancel</Button><Button type="submit" disabled={loading} className="bg-blue-600 hover:bg-blue-700 text-white">{loading ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating...</>) : ('Create Company Enquiry')}</Button></div></DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}