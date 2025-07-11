// @ts-nocheck
"use client"

import { useState, useCallback, useMemo, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { User, Users, Phone, Mail, MapPin, Building2, Loader2, Info, FileText, Briefcase, UserPlus } from "lucide-react"
import { supabase } from "@/lib/supabase/client"
import { toast } from "@/hooks/use-toast"
import { fetchDepartments } from "../../departments/departments/database"

interface Individual {
    id: number
    full_name: string
    first_name?: string
    last_name?: string
    contact_details?: {
        phone?: {
            kenyan?: { primary?: string }
            whatsapp?: string
        }
        email?: { primary?: string }
    }
    individual_type: 'principal' | 'dependant'
    relationships?: Array<{
        related_individual_id: number
        relationship_type: string
        related_individual?: {
            id: number
            full_name: string
        }
    }>
    r_number?: string
}

interface EnquiryDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onEnquiryCreated: (enquiry: any) => void
}

export function EnquiryDialog({ open, onOpenChange, onEnquiryCreated }: EnquiryDialogProps) {
    const [applicantType, setApplicantType] = useState<'principal' | 'dependant'>('principal')
    const [individuals, setIndividuals] = useState<Individual[]>([])
    const [selectedIndividual, setSelectedIndividual] = useState<Individual | null>(null)
    const [departments, setDepartments] = useState<any[]>([])
    const [loading, setLoading] = useState(false)
    const [searchLoading, setSearchLoading] = useState(false)
    const [taskType, setTaskType] = useState<'new' | 'renewal'>('new')
    const [includeDependants, setIncludeDependants] = useState(false)
    const [availableDependants, setAvailableDependants] = useState<Individual[]>([])
    const [selectedDependants, setSelectedDependants] = useState<string[]>([])
    const [companies, setCompanies] = useState<any[]>([])
    const [selectedCompany, setSelectedCompany] = useState<string>('')
    const [understudies, setUnderstudies] = useState<any[]>([])
    const [selectedUnderstudy, setSelectedUnderstudy] = useState<string>('')
    const [loadingCompanies, setLoadingCompanies] = useState(false)
    const [loadingUnderstudies, setLoadingUnderstudies] = useState(false)
    const [subdepartments, setSubdepartments] = useState<Array<Subdepartment & {
        taskManager?: {
            id: string;
            name: string | null;
            email: string | null;
            phone_number?: string | null;
            start_date?: string;
            end_date?: string | null;
        } | null;
        taskAssistant?: {
            id: string;
            name: string | null;
            email: string | null;
            phone_number?: string | null;
            start_date?: string;
            end_date?: string | null;
        } | null;
        task_manager?: {
            id: number;
            start_date?: string;
            end_date?: string | null;
        } | null;
        task_assistant?: {
            id: number;
            start_date?: string;
            end_date?: string | null;
        } | null;
        classes?: Array<{
            name: string;
            description: string | null;
            requirements: Array<{
                name: string;
                description: string | null;
                is_required?: boolean;
            }>;
        }>;
    }>>([]);
    // Form data
    const [formData, setFormData] = useState({
        // Individual details (for new individuals)
        full_name: '',
        mobile_number: '',

        // Job details
        job_description: '',
        department_id: '',
        subdepartment_id: '',
        class_id: '',
        subclass_id: '',

        // Principal member (for dependants)
        principal_member_id: '',

        // Enquiry date
        enquiry_date: new Date().toISOString().split('T')[0]
    })

    // Load departments on mount
    useEffect(() => {
        const loadDepartments = async () => {
            try {
                const depts = await fetchDepartments()
                setDepartments(depts)
            } catch (error) {
                console.error('Error loading departments:', error)
            }
        }

        if (open) {
            loadDepartments()
        }
    }, [open])

    // Search for individuals based on applicant type
    const searchIndividuals = useCallback(async (type: 'principal' | 'dependant') => {
        setSearchLoading(true)
        try {
            const { data, error } = await supabase
                .from('registry_individuals')
                .select(`
                    id,
                    full_name,
                    first_name,
                    last_name,
                    contact_details,
                    individual_type,
                    r_number,
                    relationships, 
                    employment_history
                `)
                .eq('individual_type', type)
                .order('full_name')

            if (error) throw error

            setIndividuals(data || [])

            // If searching for principals, show their dependants in the include section
            if (type === 'principal' && selectedIndividual?.individual_type === 'principal') {
                const dependants = await fetchDependants(selectedIndividual.id)
                setAvailableDependants(dependants)
            }
        } catch (error) {
            console.error('Error searching individuals:', error)
            toast({
                title: "Error",
                description: "Failed to load individuals",
                variant: "destructive"
            })
        } finally {
            setSearchLoading(false)
        }
    }, [selectedIndividual])

    // Fetch family members for a principal
    const fetchDependants = async (principalId: number) => {
        try {
            // First, get the principal with their relationships
            const { data: principal, error: principalError } = await supabase
                .from('registry_individuals')
                .select(`
                    id,
                    relationships
                `)
                .eq('id', principalId)
                .single()

            if (principalError) throw principalError
            if (!principal?.relationships?.length) return []

            // Extract all related individual IDs from relationships
            const relatedIds = principal.relationships
                .filter((rel: any) => rel.individual_id && rel.individual_id !== principalId)
                .map((rel: any) => rel.individual_id)

            if (relatedIds.length === 0) return []

            // Fetch all related individuals
            const { data: familyMembers, error } = await supabase
                .from('registry_individuals')
                .select(`
                    id,
                    full_name,
                    first_name,
                    last_name,
                    contact_details,
                    individual_type,
                    r_number,
                    relationships
                `)
                .in('id', relatedIds)
                .order('full_name')

            if (error) throw error

            // Map relationships to include the relationship type
            return (familyMembers || []).map(member => {
                const relationship = principal.relationships.find(
                    (rel: any) => rel.individual_id === member.id
                )
                return {
                    ...member,
                    relationship_type: relationship?.relationship || 'family member'
                }
            })
        } catch (error) {
            console.error('Error fetching dependants:', error)
            return []
        }
    }

    const fetchCompanies = async (individualId: number) => {
        if (!individualId) return;

        setLoadingCompanies(true);
        try {
            // Get the individual with their employment history and bill_to information
            const { data: individualData, error: individualError } = await supabase
                .from('registry_individuals')
                .select('employment_history, bill_to')
                .eq('id', individualId)
                .single();

            if (individualError) throw individualError;

            const employmentHistory = individualData?.employment_history || [];
            const individualBillTo = individualData?.bill_to || null;

            if (!employmentHistory || employmentHistory.length === 0) {
                setCompanies([]);
                setSelectedCompany('');
                setUnderstudies([]);
                setSelectedUnderstudy('');
                return;
            }

            // Filter for director roles and get unique company IDs
            const directorCompanies = employmentHistory
                .filter((job: any) =>
                    job.role?.toLowerCase() === 'director' &&
                    job.company_id
                )
                .map((job: any) => job.company_id);

            const uniqueCompanyIds = [...new Set(directorCompanies)];

            if (uniqueCompanyIds.length === 0) {
                setCompanies([]);
                setSelectedCompany('');
                setUnderstudies([]);
                setSelectedUnderstudy('');
                return;
            }

            // Get the bill_to company ID if it exists
            const billToCompanyId = individualBillTo?.company?.toString();

            // Convert all company IDs to strings for consistent comparison
            const uniqueCompanyIdsStr = uniqueCompanyIds.map(id => id.toString());

            // Combine all company IDs (director companies + bill_to company if different)
            const allCompanyIds = [...new Set([...uniqueCompanyIdsStr, billToCompanyId].filter(Boolean))];

            // Fetch all companies including the bill_to company
            const { data: companiesData, error: companiesError } = await supabase
                .from('acc_portal_company_duplicate')
                .select('id, company_name')
                .in('id', allCompanyIds);

            if (companiesError) throw companiesError;

            // Create a map of company IDs to their data for easy lookup
            const companyMap = new Map();

            (companiesData || []).forEach(company => {
                if (!company) return;
                const companyId = company.id?.toString();
                if (!companyId) return;

                companyMap.set(companyId, {
                    ...company,
                    id: companyId,
                    name: company.company_name || 'Unnamed Company',
                    is_bill_to: companyId === billToCompanyId
                });
            });

            const companiesWithDetails = Array.from(companyMap.values())
                .filter(company => {
                    // Convert both IDs to strings for comparison
                    const companyId = company.id?.toString();
                    return uniqueCompanyIdsStr.includes(companyId) ||
                        (billToCompanyId === companyId && !uniqueCompanyIdsStr.includes(companyId));
                });
            setCompanies(companiesWithDetails);

            // Auto-select the first company if only one exists
            if (companiesWithDetails.length === 1) {
                setSelectedCompany(companiesWithDetails[0].id);
                fetchUnderstudies(companiesWithDetails[0].id);
            } else {
                setSelectedCompany('');
                setUnderstudies([]);
                setSelectedUnderstudy('');
            }
        } catch (error) {
            console.error('Error fetching companies:', error);
            toast({
                title: "Error",
                description: "Failed to load companies",
                variant: "destructive"
            });
        } finally {
            setLoadingCompanies(false);
        }
    };

    const fetchUnderstudies = async (companyId: string) => {
        if (!companyId) {
            setUnderstudies([]);
            setSelectedUnderstudy('');
            return;
        }

        setLoadingUnderstudies(true);
        try {
            // Get all individuals who have this company in their employment history as understudies
            const { data: individuals, error } = await supabase
                .from('registry_individuals')
                .select('*');

            if (error) throw error;

            // Filter individuals who are understudies for this company
            const understudiesList = individuals.filter(individual => {
                if (!individual.employment_history) return false;

                return individual.employment_history.some((job: any) =>
                    job.company_id === companyId &&
                    job.understudy?.is_understudy === true
                );
            });

            // Add employment details to each understudy
            const understudiesWithDetails = understudiesList.map(understudy => {
                const employment = understudy.employment_history.find((job: any) =>
                    job.company_id === companyId &&
                    job.understudy?.is_understudy === true
                );

                return {
                    ...understudy,
                    employment_details: employment?.understudy || {}
                };
            });

            setUnderstudies(understudiesWithDetails);
            setSelectedUnderstudy('');
        } catch (error) {
            console.error('Error fetching understudies:', error);
            toast({
                title: "Error",
                description: "Failed to load understudies",
                variant: "destructive"
            });
        } finally {
            setLoadingUnderstudies(false);
        }
    };

    // Load individuals when applicant type changes
    useEffect(() => {
        if (open) {
            searchIndividuals(applicantType);
            setSelectedIndividual(null);
            setCompanies([]);
            setSelectedCompany('');
            setUnderstudies([]);
            setSelectedUnderstudy('');
            setFormData(prev => ({
                ...prev,
                principal_member_id: ''
            }));
        }
    }, [applicantType, open, searchIndividuals]);

    // Handle company selection change
    useEffect(() => {
        if (selectedCompany) {
            fetchUnderstudies(selectedCompany);
        } else {
            setUnderstudies([]);
            setSelectedUnderstudy('');
        }
    }, [selectedCompany]);

    // Get available subdepartments
    const availableSubdepartments = useMemo(() => {
        if (!formData.department_id) return []
        const dept = departments.find(d => d.id === formData.department_id)
        return dept?.tm_subdepartments || []
    }, [departments, formData.department_id])

    // Get available classes
    const availableClasses = useMemo(() => {
        if (!formData.subdepartment_id) return []
        const subdept = availableSubdepartments.find(s => s.id === formData.subdepartment_id)
        return subdept?.classes || []
    }, [availableSubdepartments, formData.subdepartment_id])

    // Get available subclasses
    const availableSubclasses = useMemo(() => {
        if (!formData.class_id) return []
        const cls = availableClasses.find(c => c.id.toString() === formData.class_id)
        return cls?.subClasses || []
    }, [availableClasses, formData.class_id])

    // Handle form submission
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            if (!selectedIndividual) {
                throw new Error('Please select an individual');
            }

            // Prepare the task data
            const taskData = {
                title: `Enquiry for ${selectedIndividual.full_name}`,
                description: formData.job_description,
                status: 'new',
                priority: 'medium',
                due_date: null, // Set appropriate due date if needed
                assigned_to: null, // Will be assigned by the workflow
                created_by: null, // Will be set by the server
                department_id: formData.department_id || null,
                subdepartment_id: formData.subdepartment_id || null,
                class_id: formData.class_id || null,
                subclass_id: formData.subclass_id || null,
                individual_id: selectedIndividual.id,
                task_type: taskType,
                dependant_data: {
                    company_id: selectedCompany || null,
                    understudy_id: selectedUnderstudy || null,
                    dependants: includeDependants ? selectedDependants : []
                },
                metadata: {
                    enquiry_date: formData.enquiry_date,
                    applicant_type: applicantType,
                    ...(applicantType === 'dependant' && principalMemberDetails && {
                        principal_member_id: principalMemberDetails.id,
                        relationship_type: principalMemberDetails.relationship_type
                    })
                }
            };

            // Insert the task into the database
            const { data, error } = await supabase
                .from('tasks')
                .insert([taskData])
                .select()
                .single();

            if (error) throw error;

            // Notify parent component
            onEnquiryCreated(data);

            // Reset form
            setFormData({
                full_name: '',
                mobile_number: '',
                job_description: '',
                department_id: '',
                subdepartment_id: '',
                class_id: '',
                subclass_id: '',
                principal_member_id: '',
                enquiry_date: new Date().toISOString().split('T')[0]
            });
            setSelectedIndividual(null);
            setSelectedCompany('');
            setSelectedUnderstudy('');
            setSelectedDependants([]);
            setIncludeDependants(false);

            // Close the dialog
            onOpenChange(false);

            // Show success message
            toast({
                title: 'Success',
                description: 'Enquiry created successfully',
                variant: 'default'
            });
        } catch (error) {
            console.error('Error creating enquiry:', error);
            toast({
                title: 'Error',
                description: error instanceof Error ? error.message : 'Failed to create enquiry',
                variant: 'destructive'
            });
        } finally {
            setLoading(false);
        }
    };
    const resetForm = () => {
        setFormData({
            full_name: '',
            mobile_number: '',
            job_description: '',
            department_id: '',
            subdepartment_id: '',
            class_id: '',
            subclass_id: '',
            principal_member_id: '',
            enquiry_date: new Date().toISOString().split('T')[0]
        })
        setSelectedIndividual(null)
        setApplicantType('principal')
        setTaskType('new')
        setIncludeDependants(false)
        setSelectedDependants([])
        setAvailableDependants([])
    }
    const handleChange = useCallback((field: keyof FormData, value: any) => {
        setFormData(prev => {
            // If changing applicant type, reset related fields
            if (field === 'applicant_type') {
                return {
                    ...prev,
                    applicant_type: value,
                    client_name: '',
                    principal_member_id: '',
                    principal_member_name: '',
                };
            }

            // If changing department, reset subdepartment and its dependant fields
            if (field === 'department_id') {
                const selectedDept = departments.find(d => d.id === value);
                return {
                    ...prev,
                    department_id: value,
                    department_name: selectedDept?.name || '',
                    subdepartment_id: '',
                    subdepartment_name: '',
                    task_manager_id: '',
                    task_manager_name: '',
                    task_assistant_id: '',
                    task_assistant_name: '',
                    class_id: '',
                    class_name: ''
                };
            }

            // If changing subdepartment, reset dependant fields but auto-populate task manager/assistant
            if (field === 'subdepartment_id') {
                const selectedSubdept = subdepartments.find(s => s.id.toString() === value.toString());

                return {
                    ...prev,
                    subdepartment_id: value,
                    subdepartment_name: selectedSubdept?.name || '',
                    task_manager_id: selectedSubdept?.taskManager?.id?.toString() || '',
                    task_manager_name: selectedSubdept?.taskManager?.name || '',
                    task_assistant_id: selectedSubdept?.taskAssistant?.id?.toString() || '',
                    task_assistant_name: selectedSubdept?.taskAssistant?.name || '',
                    class_id: '',
                    class_name: ''
                };
            }
            // If changing class
            if (field === 'class_id') {
                const selectedSubdept = subdepartments.find(s => s.id.toString() === prev.subdepartment_id.toString());
                const selectedClass = selectedSubdept?.classes?.find(c => c.id.toString() === value);
                return {
                    ...prev,
                    class_id: value,
                    class_name: selectedClass?.name || '',
                    class_description: selectedClass?.description || null,
                    subclass_id: '',
                    subclass_name: '',
                    subclass_description: null
                };
            }

            // If changing subclass
            if (field === 'subclass_id') {
                const selectedSubdept = subdepartments.find(s => s.id.toString() === prev.subdepartment_id.toString());
                const selectedClass = selectedSubdept?.classes?.find(c => c.id.toString() === prev.class_id);
                const selectedSubclass = selectedClass?.subClasses?.find(sc => sc.id.toString() === value);

                return {
                    ...prev,
                    subclass_id: value,
                    subclass_name: selectedSubclass?.name || '',
                    subclass_description: selectedSubclass?.description || null
                };
            }

            // For all other fields, update normally
            const newState = {
                ...prev,
                [field]: value
            };

            console.log('Updated form data:', newState);
            return newState;
        });
    }, [subdepartments, departments]);
    // Get principal member details for dependants
    const principalMemberDetails = useMemo(() => {
        if (applicantType !== 'dependant' || !selectedIndividual?.relationships?.length) return null

        // Find the principal relationship
        const principalRelation = selectedIndividual.relationships.find(
            (rel: any) => rel.isPrincipal === 'Yes' ||
                rel.relationship === 'principal' ||
                rel.relationship === 'spouse' ||
                rel.relationship === 'husband' ||
                rel.relationship === 'wife'
        )

        if (!principalRelation) return null

        // If we have the principal's details in the relationship, use them
        if (principalRelation.full_name) {
            return {
                id: principalRelation.individual_id,
                full_name: principalRelation.full_name,
                relationship_type: principalRelation.relationship
            }
        }

        // Otherwise, we need to fetch the principal's details
        const fetchPrincipal = async () => {
            const { data, error } = await supabase
                .from('registry_individuals')
                .select('id, full_name')
                .eq('id', principalRelation.individual_id)
                .single()

            if (error || !data) return null

            return {
                id: data.id,
                full_name: data.full_name,
                relationship_type: principalRelation.relationship
            }
        }

        // Return a promise that will be handled by the component
        return fetchPrincipal()
    }, [applicantType, selectedIndividual])

    const handleFormChange = (field: string, value: any) => {
        setFormData(prev => ({
            ...prev,
            [field]: value
        }))
    }

    const handleIndividualSelect = async (individual: Individual) => {
        setSelectedIndividual(individual);
        setSelectedCompany('');
        setUnderstudies([]);
        setSelectedUnderstudy('');

        // Update form data with individual details
        const formUpdate: any = {
            full_name: individual.full_name,
            mobile_number: individual.contact_details?.personal_mobile_num_kenyan_1 ||
                individual.contact_details?.personal_mobile_num_kenyan_2 ||
                individual.contact_details?.office_phone_number ||
                individual.contact_details?.broadcast_whatsapp_number ||
                '',
            principal_member_id: ''
        };

        if (individual.individual_type === 'principal') {
            // If selecting a principal, fetch their family members and companies
            const [familyMembers] = await Promise.all([
                fetchDependants(individual.id),
                fetchCompanies(individual.id)
            ]);
            setAvailableDependants(familyMembers);
        } else if (individual.individual_type === 'dependant' && individual.relationships?.length) {
            // For dependants, find the principal from relationships
            const principalRelation = individual.relationships.find(
                (rel: any) => rel.isPrincipal === 'Yes' ||
                    rel.relationship === 'principal' ||
                    rel.relationship === 'spouse' ||
                    rel.relationship === 'husband' ||
                    rel.relationship === 'wife'
            );

            if (principalRelation) {
                formUpdate.principal_member_id = principalRelation.individual_id.toString();

                // If we have the principal's details in the relationship, update the form
                if (principalRelation.full_name) {
                    formUpdate.principal_member_name = principalRelation.full_name;
                }

                // Fetch companies for the principal
                if (principalRelation.individual_id) {
                    await fetchCompanies(principalRelation.individual_id);
                }
            }
        }

        setFormData(prev => ({
            ...prev,
            ...formUpdate
        }));
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="text-2xl font-bold text-gray-900">New Enquiry</DialogTitle>
                    <DialogDescription className="text-gray-600">
                        Record a new client enquiry to start the process
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Main Grid Layout */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Left Column - Applicant Information */}
                        <div className="lg:col-span-1 space-y-6">
                            {/* Applicant Type */}
                            <Card className="border border-gray-200 rounded-lg">
                                <CardHeader className="pb-3">
                                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                                        <User className="h-4 w-4" />
                                        Applicant Type
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <RadioGroup
                                        value={applicantType}
                                        onValueChange={(value: 'principal' | 'dependant') => setApplicantType(value)}
                                        className="space-y-2"
                                    >
                                        <div className="flex items-center space-x-2">
                                            <RadioGroupItem value="principal" id="principal" />
                                            <Label htmlFor="principal" className="font-normal">
                                                Principal
                                            </Label>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <RadioGroupItem value="dependant" id="dependant" />
                                            <Label htmlFor="dependant" className="font-normal">
                                                Dependant
                                            </Label>
                                        </div>
                                    </RadioGroup>
                                </CardContent>
                            </Card>

                            {/* Individual Selection */}
                            <Card className="border border-gray-200 rounded-lg">
                                <CardHeader className="pb-3">
                                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                                        <Users className="h-4 w-4" />
                                        {selectedIndividual ? 'Selected Individual' : 'Select Individual'}
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    {searchLoading ? (
                                        <div className="flex items-center justify-center p-4">
                                            <Loader2 className="h-5 w-5 animate-spin text-gray-500" />
                                        </div>
                                    ) : (
                                        <Select
                                            value={selectedIndividual?.id?.toString() || ''}
                                            onValueChange={(value) => {
                                                const individual = individuals.find(i => i.id.toString() === value);
                                                if (individual) handleIndividualSelect(individual);
                                            }}
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder={`Select ${applicantType}...`} />
                                            </SelectTrigger>
                                            <SelectContent className="max-h-60">
                                                {individuals.map((individual) => (
                                                    <SelectItem key={individual.id} value={individual.id.toString()}>
                                                        <div className="flex flex-col">
                                                            <span>{individual.full_name}</span>
                                                            {individual.contact_details?.phone?.kenyan?.primary && (
                                                                <span className="text-xs text-gray-500">
                                                                    {individual.contact_details.phone.kenyan.primary}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    )}

                                    <div className="space-y-3">
                                        <div className="relative">
                                            <div className="absolute inset-0 flex items-center">
                                                <span className="w-full border-t" />
                                            </div>
                                            <div className="relative flex justify-center text-xs uppercase">
                                                <span className="bg-background px-2 text-muted-foreground">Or create new</span>
                                            </div>
                                        </div>

                                        <div className="space-y-3">
                                            <div>
                                                <Label htmlFor="full-name" className="text-sm font-medium">
                                                    Full Name <span className="text-red-500">*</span>
                                                </Label>
                                                <Input
                                                    id="full-name"
                                                    value={formData.full_name}
                                                    onChange={(e) => handleFormChange('full_name', e.target.value)}
                                                    placeholder="Enter full name"
                                                    required={!selectedIndividual}
                                                    className="mt-1"
                                                />
                                            </div>
                                            <div>
                                                <Label htmlFor="mobile" className="text-sm font-medium">
                                                    Mobile Number <span className="text-red-500">*</span>
                                                </Label>
                                                <Input
                                                    id="mobile"
                                                    type="tel"
                                                    value={formData.mobile_number}
                                                    onChange={(e) => handleFormChange('mobile_number', e.target.value)}
                                                    placeholder="Enter mobile number"
                                                    required={!selectedIndividual}
                                                    className="mt-1"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Company Selection */}
                            <Card className="border border-gray-200 rounded-lg">
                                <CardHeader className="pb-3">
                                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                                        <Building2 className="h-4 w-4" />
                                        Select Company
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <Select
                                        value={selectedCompany}
                                        onValueChange={(value: string) => {
                                            console.log('Selected company:', value);
                                            setSelectedCompany(value);
                                            fetchUnderstudies(value);
                                        }}
                                    // Temporarily removed disabled prop for testing
                                    >
                                        <SelectTrigger className="w-full">
                                            <SelectValue placeholder="Select company...">
                                                {selectedCompany ? (
                                                    <span>{companies.find(c => c.id === selectedCompany)?.name || 'Select...'}</span>
                                                ) : 'Select company...'}
                                            </SelectValue>
                                        </SelectTrigger>
                                        <SelectContent>
                                            {companies.length > 0 ? (
                                                companies.map((company) => {
                                                    if (!company) return null;
                                                    const companyId = company.id?.toString() || '';
                                                    const companyName = company.name || company.company_name || 'Unnamed Company';
                                                    const isBillTo = company.is_bill_to || false;

                                                    return (
                                                        <SelectItem
                                                            key={companyId}
                                                            value={companyId}
                                                            className="cursor-pointer"
                                                        >
                                                            <div className="flex flex-col">
                                                                <div className="flex items-center gap-2">
                                                                    <span>{companyName}</span>
                                                                    {isBillTo && (
                                                                        <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
                                                                            Bill To
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                {/* {isBillTo && (
                                                                        <div className="text-xs text-gray-500 mt-1 space-y-1">
                                                                            <div>Billing Company</div>
                                                                            <div>Name: {companyName}</div>
                                                                            <div>ID: {companyId}</div>
                                                                        </div>
                                                                    )} */}
                                                            </div>
                                                        </SelectItem>
                                                    );
                                                })
                                            ) : (
                                                <div className="px-3 py-2 text-sm text-muted-foreground">
                                                    No companies found
                                                </div>
                                            )}
                                        </SelectContent>
                                    </Select>
                                </CardContent>
                            </Card>

                            {/* Understudy Selection */}
                            {selectedCompany && (
                                <Card className="border border-gray-200 rounded-lg">
                                    <CardHeader className="pb-3">
                                        <CardTitle className="text-base font-semibold flex items-center gap-2">
                                            <UserPlus className="h-4 w-4" />
                                            Select Understudy
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <Select
                                            value={selectedUnderstudy}
                                            onValueChange={setSelectedUnderstudy}
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select understudy..." />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {understudies.length > 0 ? (
                                                    understudies.map((understudy) => {
                                                        if (!understudy) return null;
                                                        const understudyId = understudy.id?.toString() || '';
                                                        const understudyName = understudy.name || understudy.company_name || 'Unnamed Company';
                                                        return (
                                                            <SelectItem
                                                                key={understudyId}
                                                                value={understudyId}
                                                                className="cursor-pointer"
                                                            >
                                                                {understudy.full_name}
                                                            </SelectItem>
                                                        );
                                                    })
                                                ) : (
                                                    <div className="px-3 py-2 text-sm text-muted-foreground">
                                                        No understudies found
                                                    </div>
                                                )}
                                            </SelectContent>
                                        </Select>
                                    </CardContent>
                                </Card>)}
                            {/* Dependants Selection */}
                            {availableDependants.length > 0 && (
                                <Card className="border border-gray-200 rounded-lg">
                                    <CardHeader className="pb-3">
                                        <CardTitle className="text-base font-semibold flex items-center gap-2">
                                            <Users className="h-4 w-4" />
                                            Include Family Members
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="space-y-2">
                                            <div className="flex items-center space-x-2">
                                                <input
                                                    type="checkbox"
                                                    id="include-dependants"
                                                    checked={includeDependants}
                                                    onChange={(e) => {
                                                        setIncludeDependants(e.target.checked);
                                                        if (!e.target.checked) {
                                                            setSelectedDependants([]);
                                                        }
                                                    }}
                                                    className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                                />
                                                <label htmlFor="include-dependants" className="text-sm font-medium">
                                                    Include family members in this enquiry
                                                </label>
                                            </div>

                                            {includeDependants && (
                                                <div className="mt-2 space-y-2 max-h-60 overflow-y-auto border rounded-md p-2">
                                                    {availableDependants.map((dependant) => (
                                                        <div key={dependant.id} className="flex items-center space-x-2 p-1 hover:bg-gray-50 rounded">
                                                            <input
                                                                type="checkbox"
                                                                id={`dependant-${dependant.id}`}
                                                                checked={selectedDependants.includes(dependant.id.toString())}
                                                                onChange={(e) => {
                                                                    if (e.target.checked) {
                                                                        setSelectedDependants(prev => [...prev, dependant.id.toString()]);
                                                                    } else {
                                                                        setSelectedDependants(prev =>
                                                                            prev.filter(id => id !== dependant.id.toString())
                                                                        );
                                                                    }
                                                                }}
                                                                className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                                            />
                                                            <label
                                                                htmlFor={`dependant-${dependant.id}`}
                                                                className="text-sm flex-1 flex justify-between items-center"
                                                            >
                                                                <span>{dependant.full_name}</span>
                                                                <span className="text-xs text-gray-500 capitalize">
                                                                    {dependant.relationship_type || 'family member'}
                                                                </span>
                                                            </label>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </CardContent>
                                </Card>
                            )}

                        </div>

                        {/* Right Column - Enquiry Details */}
                        <div className="lg:col-span-2 space-y-6">
                            <Card className="border border-gray-200 rounded-lg">
                                <CardHeader className="pb-3">
                                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                                        <FileText className="h-4 w-4" />
                                        Enquiry Details
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <Label htmlFor="task-type" className="text-sm font-medium">
                                                Task Type <span className="text-red-500">*</span>
                                            </Label>
                                            <Select
                                                value={taskType}
                                                onValueChange={(value: 'new' | 'renewal') => setTaskType(value)}
                                            >
                                                <SelectTrigger className="mt-1">
                                                    <SelectValue placeholder="Select task type" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="new">New</SelectItem>
                                                    <SelectItem value="renewal">Renewal</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div>
                                            <Label htmlFor="enquiry-date" className="text-sm font-medium">
                                                Enquiry Date <span className="text-red-500">*</span>
                                            </Label>
                                            <Input
                                                id="enquiry-date"
                                                type="date"
                                                value={formData.enquiry_date}
                                                onChange={(e) => handleFormChange('enquiry_date', e.target.value)}
                                                className="mt-1"
                                                required
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <Label htmlFor="job-description" className="text-sm font-medium">
                                            Job Description <span className="text-red-500">*</span>
                                        </Label>
                                        <Textarea
                                            id="job-description"
                                            value={formData.job_description}
                                            onChange={(e) => handleFormChange('job_description', e.target.value)}
                                            placeholder="Describe the enquiry details..."
                                            className="mt-1 min-h-[100px]"
                                            required
                                        />
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Department & Classification */}
                            <Card className="border border-gray-200 rounded-lg">
                                <CardHeader className="pb-3">
                                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                                        <Building2 className="h-4 w-4" />
                                        Department & Classification
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <Label htmlFor="department" className="text-sm font-medium">
                                                Department <span className="text-red-500">*</span>
                                            </Label>
                                            <Select
                                                value={formData.department_id}
                                                onValueChange={(value) => {
                                                    const selectedDept = departments.find(d => d.id === value);
                                                    if (selectedDept) {
                                                        handleChange('department_id', value);
                                                        handleChange('department_name', selectedDept.name);
                                                        handleChange('subdepartment_id', '');
                                                    }
                                                }}
                                                disabled={departments.length === 0}
                                            >
                                                <SelectTrigger className="mt-1">
                                                    <SelectValue
                                                        placeholder={
                                                            departments.length === 0
                                                                ? "Loading departments..."
                                                                : "Select department"
                                                        }
                                                    />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {departments.map((dept) => (
                                                        <SelectItem key={dept.id} value={dept.id}>
                                                            {dept.name}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div>
                                            <Label htmlFor="subdepartment" className="text-sm font-medium">
                                                Subdepartment
                                            </Label>
                                            <Select
                                                value={formData.subdepartment_id}
                                                onValueChange={(value) => {
                                                    const selectedSubdept = availableSubdepartments.find(sd => sd.id === value);
                                                    if (selectedSubdept) {
                                                        handleChange('subdepartment_id', value);
                                                        handleChange('subdepartment_name', selectedSubdept.name);
                                                    }
                                                }}
                                                disabled={!formData.department_id || availableSubdepartments.length === 0}
                                            >
                                                <SelectTrigger className="mt-1">
                                                    <SelectValue
                                                        placeholder={
                                                            !formData.department_id
                                                                ? "Select department first"
                                                                : availableSubdepartments.length === 0
                                                                    ? "No subdepartments available"
                                                                    : "Select subdepartment"
                                                        }
                                                    />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {availableSubdepartments.map((subdept) => (
                                                        <SelectItem key={subdept.id} value={subdept.id}>
                                                            {subdept.name}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <Label htmlFor="class" className="text-sm font-medium">
                                                Class
                                            </Label>
                                            <Select
                                                value={formData.class_id}
                                                onValueChange={(value) => {
                                                    const selectedClass = availableClasses.find(c => c.id === value);
                                                    if (selectedClass) {
                                                        handleChange('class_id', value);
                                                        handleChange('class_name', selectedClass.name);
                                                    }
                                                }}
                                                disabled={!formData.subdepartment_id || availableClasses.length === 0}
                                            >
                                                <SelectTrigger className="mt-1">
                                                    <SelectValue
                                                        placeholder={
                                                            !formData.subdepartment_id
                                                                ? "Select subdepartment first"
                                                                : availableClasses.length === 0
                                                                    ? "No classes available"
                                                                    : "Select class"
                                                        }
                                                    />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {availableClasses.map((cls) => (
                                                        <SelectItem key={cls.id} value={cls.id}>
                                                            {cls.name}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div>
                                            <Label htmlFor="subclass" className="text-sm font-medium">
                                                Subclass
                                            </Label>
                                            <Select
                                                value={formData.subclass_id}
                                                onValueChange={(value) => {
                                                    const selectedSubclass = availableSubclasses.find(sc => sc.id === value);
                                                    if (selectedSubclass) {
                                                        handleChange('subclass_id', value);
                                                        handleChange('subclass_name', selectedSubclass.name);
                                                    }
                                                }}
                                                disabled={!formData.class_id || availableSubclasses.length === 0}
                                            >
                                                <SelectTrigger className="mt-1">
                                                    <SelectValue
                                                        placeholder={
                                                            !formData.class_id
                                                                ? "Select class first"
                                                                : availableSubclasses.length === 0
                                                                    ? "No subclasses available"
                                                                    : "Select subclass"
                                                        }
                                                    />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {availableSubclasses.map((subclass) => (
                                                        <SelectItem key={subclass.id} value={subclass.id}>
                                                            {subclass.name}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                    {/* Form Actions */}
                    <DialogFooter className="flex flex-col sm:flex-row sm:justify-between gap-3">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                                resetForm();
                                onOpenChange(false);
                            }}
                            disabled={loading}
                        >
                            Cancel
                        </Button>
                        <Button type="submit" disabled={loading}>
                            {loading ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Creating...
                                </>
                            ) : (
                                'Create Enquiry'
                            )}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}