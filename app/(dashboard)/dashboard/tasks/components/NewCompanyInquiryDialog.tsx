// @ts-nocheck
"use client"

import { useState, useCallback, useMemo, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Check, ChevronsUpDown, User, Users, Building2, Loader2, FileText, Briefcase, Shield, Info } from "lucide-react"
import { cn } from "@/lib/utils"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from "@/components/ui/command"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { supabase } from "@/lib/supabase/client"
import { toast } from "@/hooks/use-toast"
import { format } from "date-fns"

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

    const [companies, setCompanies] = useState<Company[]>([])
    const [selectedCompany, setSelectedCompany] = useState<Company | null>(null)
    const [officials, setOfficials] = useState<Official[]>([])
    const [selectedOfficialIds, setSelectedOfficialIds] = useState<Set<number>>(new Set())
    const [primaryDirectorId, setPrimaryDirectorId] = useState<number | null>(null)

    const [loadingCompanies, setLoadingCompanies] = useState(false)
    const [loadingOfficials, setLoadingOfficials] = useState(false)
    const [loading, setLoading] = useState(false)
    const [loadingStaff, setLoadingStaff] = useState(false)

    const [isCompanyPopoverOpen, setIsCompanyPopoverOpen] = useState(false)

    const [departments, setDepartments] = useState<any[]>(propDepartments || [])
    const [localUsers, setLocalUsers] = useState<any[]>(users || [])
    const [localOfficers, setLocalOfficers] = useState<any[]>(officers || [])
    const [taskType, setTaskType] = useState<'new' | 'renewal'>('new')
    const [availableOfficers, setAvailableOfficers] = useState([])
    const [availableManagers, setAvailableManagers] = useState([])
    const [availableAssistants, setAvailableAssistants] = useState([])
    
    const [formData, setFormData] = useState({
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

    // Populate form on Edit Mode
    useEffect(() => {
        if (open && initialData) {
            setFormData({
                job_description: initialData.job_description || '',
                department_id: initialData.department_id?.toString() || '',
                subdepartment_id: initialData.subdepartment_id?.toString() || '',
                class_id: initialData.class_id?.toString() || '',
                subclass_id: initialData.subclass_id?.toString() || '',
                officer_id: initialData.officer_id?.toString() || '',
                task_manager_id: initialData.task_manager_id?.toString() || '',
                task_assistant_id: initialData.task_assistant_id?.toString() || '',
                enquiry_date: initialData.date_initiated ? new Date(initialData.date_initiated).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]
            });
            setTaskType(initialData.renewal_status || 'new');
            setSelectedCompany({
                id: initialData.company_id,
                company_name: initialData.applicant_name
            });
            
            if (initialData.directors_details) {
                const ids = initialData.directors_details.map((d: any) => d.id);
                setSelectedOfficialIds(new Set(ids));
                const primary = initialData.directors_details.find((d: any) => d.is_primary);
                if (primary) setPrimaryDirectorId(primary.id);
            }
        } else if (open && !initialData) {
            resetForm();
        }
    }, [open, initialData]);

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

    const fetchOfficials = useCallback(async (companyId: number) => {
        setLoadingOfficials(true);
        try {
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
            setOfficials(uniqueOfficials);
            
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
    }, [isEditMode]);

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
        if (selectedCompany) fetchOfficials(selectedCompany.id);
    }, [selectedCompany, fetchOfficials]);

    const loadStaffData = useCallback(async () => {
        setLoadingStaff(true);
        try {
            const [usersResult, officersResult] = await Promise.all([
                supabase.from('tm_users').select('*').order('name'),
                supabase.from('tm_users').select('*').eq('role', 'officer').order('name')
            ]);
            setLocalUsers(usersResult.data || []);
            setLocalOfficers(officersResult.data || []);
        } finally {
            setLoadingStaff(false);
        }
    }, []);

    useEffect(() => {
        if (open && localUsers.length === 0) loadStaffData();
    }, [open, localUsers.length, loadStaffData]);

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
                participants_details: participants_details
            };

            let result;
            if (isEditMode) {
                result = await supabase.from('tm_tasks').update(taskPayload).eq('id', initialData.id).select();
            } else {
                result = await supabase.from('tm_tasks').insert([taskPayload]).select();
            }

            if (result.error) throw result.error;
            toast({ title: 'Success', description: `Enquiry ${isEditMode ? 'updated' : 'created'}` });
            onEnquiryCreated(result.data);
            onOpenChange(false);
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
        setFormData({
            job_description: '',
            department_id: selectedDepartmentId || '',
            subdepartment_id: selectedSubdepartmentId || '',
            class_id: selectedClassId || '',
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
                    <DialogTitle>{isEditMode ? 'Edit Company Enquiry' : 'New Company Enquiry'}</DialogTitle>
                    <DialogDescription>
                        {isEditMode ? 'Modify existing task details.' : 'Register a new enquiry for a company and its officials.'}
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* LEFT COLUMN: Entity selection */}
                        <div className="lg:col-span-1 space-y-6">
                            <Card className="border-blue-100 shadow-sm">
                                <CardHeader className="pb-3">
                                    <CardTitle className="text-sm font-bold flex items-center gap-2">
                                        <Building2 className="h-4 w-4 text-blue-600" /> Company
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <Popover open={isCompanyPopoverOpen} onOpenChange={setIsCompanyPopoverOpen}>
                                        <PopoverTrigger asChild>
                                            <Button variant="outline" role="combobox" className={cn("w-full justify-between text-left font-normal", !selectedCompany && "text-muted-foreground")}>
                                                <span className="truncate">{selectedCompany ? selectedCompany.company_name : "Search company..."}</span>
                                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                                            <Command>
                                                <CommandInput placeholder="Type company name..." />
                                                <CommandEmpty>No results.</CommandEmpty>
                                                <CommandGroup className="max-h-60 overflow-auto">
                                                    {loadingCompanies ? (
                                                        <div className="flex justify-center p-2"><Loader2 className="h-4 w-4 animate-spin" /></div>
                                                    ) : companies.map((c) => (
                                                        <CommandItem key={c.id} onSelect={() => { setSelectedCompany(c); setIsCompanyPopoverOpen(false); }}>
                                                            {c.company_name}
                                                            <Check className={cn("ml-auto h-4 w-4", selectedCompany?.id === c.id ? "opacity-100" : "opacity-0")} />
                                                        </CommandItem>
                                                    ))}
                                                </CommandGroup>
                                            </Command>
                                        </PopoverContent>
                                    </Popover>
                                </CardContent>
                            </Card>

                            {selectedCompany && (
                                <Card className="border-blue-100 shadow-sm">
                                    <CardHeader className="pb-3">
                                        <CardTitle className="text-sm font-bold flex items-center gap-2">
                                            <Users className="h-4 w-4 text-blue-600" /> Officials
                                        </CardTitle>
                                        <CardDescription className="text-[11px]">Select directors or shareholders to include.</CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        {loadingOfficials ? (
                                            <div className="flex flex-col items-center py-6 text-muted-foreground gap-2">
                                                <Loader2 className="h-5 w-5 animate-spin" />
                                                <span className="text-xs">Loading officials...</span>
                                            </div>
                                        ) : officials.length > 0 ? (
                                            <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                                                {officials.map((official) => (
                                                    <div 
                                                        key={official.id} 
                                                        className={cn(
                                                            "p-3 rounded-lg border transition-all",
                                                            selectedOfficialIds.has(official.id) ? "bg-blue-50/50 border-blue-200" : "bg-card border-slate-100"
                                                        )}
                                                    >
                                                        <div className="flex items-start gap-3">
                                                            <div className="pt-0.5">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={selectedOfficialIds.has(official.id)}
                                                                    onChange={() => handleOfficialSelection(official.id)}
                                                                    className="h-4 w-4 rounded border-slate-300 text-blue-600 cursor-pointer"
                                                                />
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                                                                    <span className="text-xs font-semibold truncate leading-none">{official.full_name}</span>
                                                                    {official.is_current ? (
                                                                        <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] px-1.5 py-0 h-4">Active</Badge>
                                                                    ) : (
                                                                        <Badge className="bg-slate-50 text-slate-500 border-slate-200 text-[10px] px-1.5 py-0 h-4">Inactive</Badge>
                                                                    )}
                                                                </div>
                                                                
                                                                <div className="flex flex-wrap gap-1 mb-2">
                                                                    {official.roles.map(role => (
                                                                        <Badge key={role} variant="outline" className={cn(
                                                                            "text-[9px] px-1.5 py-0 h-4 uppercase font-bold",
                                                                            role === 'Director' ? "text-indigo-600 border-indigo-200" : "text-amber-600 border-amber-200"
                                                                        )}>
                                                                            {role}
                                                                        </Badge>
                                                                    ))}
                                                                </div>

                                                                {official.roles.includes('Director') && selectedOfficialIds.has(official.id) && (
                                                                    <div className="mt-2 pt-2 border-t border-blue-100 flex items-center gap-2">
                                                                        <input
                                                                            type="radio"
                                                                            id={`primary-${official.id}`}
                                                                            name="primary-director"
                                                                            checked={primaryDirectorId === official.id}
                                                                            onChange={() => setPrimaryDirectorId(official.id)}
                                                                            className="h-3 w-3 text-blue-600"
                                                                        />
                                                                        <label htmlFor={`primary-${official.id}`} className="text-[10px] text-slate-500 cursor-pointer font-medium italic">
                                                                            Set as Primary Director
                                                                        </label>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="text-center py-8 text-slate-400 bg-slate-50 rounded-lg border border-dashed">
                                                <Info className="h-8 w-8 mx-auto mb-2 opacity-20" />
                                                <p className="text-xs">No officials linked to this company.</p>
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            )}
                        </div>

                        {/* RIGHT COLUMN: Details & Assignment */}
                        <div className="lg:col-span-2 space-y-6">
                            <Card className="shadow-sm">
                                <CardHeader className="pb-3 border-b mb-4">
                                    <CardTitle className="text-sm font-bold flex items-center gap-2">
                                        <FileText className="h-4 w-4 text-slate-600" /> Basic Information
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1.5">
                                            <Label className="text-xs">Task Context</Label>
                                            <Select value={taskType} onValueChange={(v: any) => setTaskType(v)}>
                                                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="new" className="text-xs">New</SelectItem>
                                                    <SelectItem value="renewal" className="text-xs">Renewal/Compliance</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label className="text-xs">Date of Enquiry</Label>
                                            <Input type="date" className="h-9 text-xs" value={formData.enquiry_date} onChange={(e) => setFormData(p => ({ ...p, enquiry_date: e.target.value }))} required />
                                        </div>
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className="text-xs">Job Description</Label>
                                        <Textarea 
                                            value={formData.job_description} 
                                            onChange={(e) => setFormData(p => ({ ...p, job_description: e.target.value }))} 
                                            placeholder="Specify the services requested or the scope of the work..." 
                                            className="min-h-[80px] text-xs resize-none"
                                            required 
                                        />
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="shadow-sm">
                                <CardHeader className="pb-3 border-b mb-4">
                                    <CardTitle className="text-sm font-bold flex items-center gap-2">
                                        <Briefcase className="h-4 w-4 text-slate-600" /> Classification
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1.5">
                                            <Label className="text-xs">Department</Label>
                                            <Select value={formData.department_id} onValueChange={(v) => {
                                                setFormData(prev => ({ ...prev, department_id: v, subdepartment_id: '', class_id: '', subclass_id: '' }));
                                            }}>
                                                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Select Dept" /></SelectTrigger>
                                                <SelectContent>{departments.map(d => <SelectItem key={d.id} value={d.id.toString()} className="text-xs">{d.name}</SelectItem>)}</SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label className="text-xs">Subdepartment</Label>
                                            <Select value={formData.subdepartment_id} onValueChange={(v) => {
                                                setFormData(prev => ({ ...prev, subdepartment_id: v, class_id: '', subclass_id: '' }));
                                            }}>
                                                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Select Subdept" /></SelectTrigger>
                                                <SelectContent>{availableSubdepartments.map(sd => <SelectItem key={sd.id} value={sd.id.toString()} className="text-xs">{sd.name}</SelectItem>)}</SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1.5">
                                            <Label className="text-xs">Class</Label>
                                            <Select value={formData.class_id} onValueChange={(v) => {
                                                setFormData(prev => ({ ...prev, class_id: v, subclass_id: '' }));
                                            }}>
                                                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Select Class" /></SelectTrigger>
                                                <SelectContent>{availableClasses.map(c => <SelectItem key={c.id} value={c.id.toString()} className="text-xs">{c.name}</SelectItem>)}</SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label className="text-xs">Subclass</Label>
                                            <Select value={formData.subclass_id} onValueChange={(v) => setFormData(p => ({ ...p, subclass_id: v }))}>
                                                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Select Subclass" /></SelectTrigger>
                                                <SelectContent>{availableSubclasses.map(sc => <SelectItem key={sc.id} value={sc.id.toString()} className="text-xs">{sc.name}</SelectItem>)}</SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="shadow-sm border-indigo-100">
                                <CardHeader className="pb-3 border-b border-indigo-50 mb-4">
                                    <CardTitle className="text-sm font-bold flex items-center gap-2">
                                        <Shield className="h-4 w-4 text-indigo-600" /> Assignment
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="space-y-1.5">
                                        <Label className="text-xs text-indigo-900">Officer</Label>
                                        <Select value={formData.officer_id} onValueChange={(v) => setFormData(p => ({ ...p, officer_id: v }))}>
                                            <SelectTrigger className="h-9 text-xs border-indigo-100"><SelectValue placeholder="Assign Officer" /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="none">No Officer</SelectItem>
                                                {localOfficers.map(o => <SelectItem key={o.id} value={o.id.toString()} className="text-xs">{o.name}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className="text-xs text-indigo-900">Task Manager</Label>
                                        <Select value={formData.task_manager_id} onValueChange={(v) => setFormData(p => ({ ...p, task_manager_id: v }))}>
                                            <SelectTrigger className="h-9 text-xs border-indigo-100"><SelectValue placeholder="Assign Manager" /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="none">No Manager</SelectItem>
                                                {localUsers.map(m => <SelectItem key={m.id} value={m.id.toString()} className="text-xs">{m.name}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className="text-xs text-indigo-900">Assistant</Label>
                                        <Select value={formData.task_assistant_id} onValueChange={(v) => setFormData(p => ({ ...p, task_assistant_id: v }))}>
                                            <SelectTrigger className="h-9 text-xs border-indigo-100"><SelectValue placeholder="Assign Assistant" /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="none">No Assistant</SelectItem>
                                                {localUsers.map(a => <SelectItem key={a.id} value={a.id.toString()} className="text-xs">{a.name}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    </div>

                    <DialogFooter className="border-t pt-4">
                        <Button type="button" variant="ghost" className="text-xs" onClick={() => onOpenChange(false)}>Cancel</Button>
                        <Button 
                            type="submit" 
                            className="bg-blue-600 hover:bg-blue-700 text-xs px-8" 
                            disabled={loading || !selectedCompany || selectedOfficialIds.size === 0}
                        >
                            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            {isEditMode ? 'Save Changes' : 'Create Inquiry Task'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}