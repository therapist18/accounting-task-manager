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
    users: any[]
    officers: any[]
}

export function NewCompanyInquiryDialog({
    open,
    onOpenChange,
    onEnquiryCreated,
    departments: propDepartments = [],
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
        department_id: '',
        subdepartment_id: '',
        class_id: '',
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

    // Effect to load companies when the dialog opens
    useEffect(() => {
        if (open && companies.length === 0) {
            loadCompanies();
        }
    }, [open, companies.length, loadCompanies]);

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


    // --- Reused Logic from EnquiryDialog (unchanged) ---
    const handleChange = useCallback((field: keyof typeof formData, value: any) => {
        setFormData(prev => {
            if (field === 'department_id') {
                return { ...prev, department_id: value, subdepartment_id: '', class_id: '', subclass_id: '', officer_id: '', task_manager_id: '', task_assistant_id: '' };
            }
            if (field === 'subdepartment_id') {
                return { ...prev, subdepartment_id: value, class_id: '', subclass_id: '', officer_id: '', task_manager_id: '', task_assistant_id: '' };
            }
            if (field === 'class_id') {
                return { ...prev, class_id: value, subclass_id: '' };
            }
            if (field === 'task_manager_id') {
                return { ...prev, task_manager_id: value, task_assistant_id: '' };
            }
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
        const loadDepts = async () => {
            if (propDepartments.length > 0) setDepartments(propDepartments);
            else setDepartments(await fetchDepartments());
        };
        if (open && departments.length === 0) loadDepts();
    }, [open, propDepartments, departments.length]);


    useEffect(() => {
        if (!open || !formData.subdepartment_id || localUsers.length === 0) return;
        const dept = departments.find(d => d.id.toString() === formData.department_id);
        const subdept = dept?.tm_subdepartments?.find(s => s.id.toString() === formData.subdepartment_id);
        if (subdept) {
            const activeStaff = findActiveStaffForSubdept(subdept, localUsers, localOfficers);
            setAvailableOfficers(activeStaff.officers);
            setAvailableManagers(activeStaff.managers);
            setAvailableAssistants([]);
            setFormData(prev => ({ ...prev, officer_id: '', task_manager_id: '', task_assistant_id: '' }));
        }
    }, [open, formData.subdepartment_id, localUsers, localOfficers, departments, formData.department_id, findActiveStaffForSubdept]);

    useEffect(() => {
        if (!formData.task_manager_id) {
            setAvailableAssistants([]);
            return;
        }
        const dept = departments.find(d => d.id.toString() === formData.department_id);
        const subdept = dept?.tm_subdepartments?.find(s => s.id.toString() === formData.subdepartment_id);
        if (subdept) {
            const assistantsForManager = subdept.assistant_history?.filter(a => !a.end_date && a.manager_id?.toString() === formData.task_manager_id).map(a => a.id) || [];
            setAvailableAssistants(localUsers.filter(user => assistantsForManager.includes(user.id)));
        }
    }, [formData.task_manager_id, formData.subdepartment_id, departments, localUsers, formData.department_id]);


    const availableSubdepartments = useMemo(() => {
        if (!formData.department_id) return [];
        const dept = departments.find(d => d.id.toString() === formData.department_id);
        return dept?.tm_subdepartments || [];
    }, [departments, formData.department_id]);

    const availableClasses = useMemo(() => {
        if (!formData.subdepartment_id) return [];
        const subdept = availableSubdepartments.find(s => s.id.toString() === formData.subdepartment_id);
        return subdept?.classes || [];
    }, [availableSubdepartments, formData.subdepartment_id]);
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
        if (!selectedCompany) {
            toast({ title: "Validation Error", description: "Please select a company.", variant: "destructive" });
            return;
        }
        if (selectedOfficialIds.size === 0) {
            toast({ title: "Validation Error", description: "Please select at least one official.", variant: "destructive" });
            return;
        }
        setLoading(true);
        console.log("🚀 [LOG] Creating company enquiries...");

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

            const tasksToCreate = Array.from(selectedOfficialIds).map(officialId => {
                const official = officials.find(d => d.id === officialId);
                if (!official) return null;

                return {
                    job_description: formData.job_description || '',
                    status: 'enquiry',
                    renewal_status: taskType,
                    department_id: formData.department_id,
                    subdepartment_id: formData.subdepartment_id,
                    individual_id: official.id,
                    applicant_type: 'principal',
                    class_id: formData.class_id || null,
                    subclass_id: formData.subclass_id || null,
                    date_initiated: new Date(formData.enquiry_date),
                    applicant_name: official.full_name,
                    company_id: selectedCompany.id,
                    principal_member: official.id,
                    stages: initialStages,
                    officer_id: formData.officer_id || null,
                    task_manager_id: formData.task_manager_id || null,
                    task_assistant_id: formData.task_assistant_id || null,
                };
            }).filter(Boolean);

            if (tasksToCreate.length === 0) {
                throw new Error("Could not construct any tasks to create.");
            }

            console.log(`📦 [LOG] Submitting ${tasksToCreate.length} tasks to Supabase.`);
            const { data, error } = await supabase.from('tm_tasks_duplicate').insert(tasksToCreate).select();

            if (error) throw error;

            console.log('✅ [LOG] Enquiries created successfully!', data);
            toast({ title: 'Success', description: `${tasksToCreate.length} enquiries created successfully.` });
            onEnquiryCreated(data);
            resetForm();
            onOpenChange(false);

        } catch (error) {
            console.error('❌ [LOG] Error creating enquiries:', error);
            toast({ title: 'Error', description: error instanceof Error ? error.message : 'Failed to create enquiries', variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    };

    const resetForm = () => {
        console.log("🧹 [LOG] Resetting form.");
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
                        Create tasks for one or more directors or shareholders of a company.
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
                                        <CardDescription>Select the directors and shareholders to include.</CardDescription>
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
                                             <Select value={formData.class_id} onValueChange={(v) => handleChange('class_id', v)} disabled={!formData.subdepartment_id}>
                                                 <SelectTrigger><SelectValue placeholder="Select class..." /></SelectTrigger>
                                                 <SelectContent>{availableClasses.map(c => <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>)}</SelectContent>
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
                            {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating...</> : `Create ${selectedOfficialIds.size} Enquiries`}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}